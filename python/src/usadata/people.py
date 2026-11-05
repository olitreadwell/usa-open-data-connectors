"""Callsign, college, and tax adapters."""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlencode

from .common import UsDataAdapter, as_number, median, require_dict, require_list
from .errors import UsSourceParseError
from .fixtures import read_fixture_json, read_fixture_text
from .http import get_json

CALLOOK_API_BASE = "https://callook.info"
COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL = "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip"
COLLEGE_SCORECARD_DATA_RELEASE_DATE = "2026-10-15"
ESTIMATETAX_API_BASE = "https://estimatetax.net"


def _callook_date(value: str | None) -> str | None:
    if value is None or value.strip() == "":
        return None
    match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", value.strip())
    return f"{match.group(3)}-{match.group(1)}-{match.group(2)}" if match else None


def _callook_coordinate(value: str | None) -> float | None:
    return as_number(value) if value is not None and value.strip() != "" else None


def _callook_state(line2: str) -> str:
    match = re.search(r"\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$", line2)
    return match.group(1) if match else ""


def _callook_district(callsign: str) -> str:
    match = re.search(r"\d", callsign)
    return match.group(0) if match else ""


def _empty_callook(status: str) -> dict[str, Any]:
    return {
        "status": status,
        "callsign": "",
        "licenseType": "",
        "operatorClass": "",
        "previousCallsign": "",
        "previousOperatorClass": "",
        "licenseeName": "",
        "trusteeCallsign": "",
        "trusteeName": "",
        "addressLine1": "",
        "addressLine2": "",
        "attention": "",
        "latitude": None,
        "longitude": None,
        "gridsquare": "",
        "grantDate": None,
        "expiryDate": None,
        "lastActionDate": None,
        "frn": "",
        "ulsUrl": "",
        "stateAbbr": "",
        "callDistrict": "",
    }


def _label_counts(values: list[str]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for value in values:
        if value:
            counts[value] = counts.get(value, 0) + 1
    return [
        {"label": key, "count": count}
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def parse_callook_callsigns_payload(payload: Any) -> dict[str, Any]:
    """Parses a batch of Callook callsign lookups."""
    rows = require_list(payload, "callook-callsigns")
    if not rows:
        raise UsSourceParseError("callook-callsigns", "The response carried no lookups")
    callsigns: list[dict[str, Any]] = []
    for record in rows:
        if not isinstance(record, dict) or record.get("status") not in (
            "VALID",
            "INVALID",
            "UPDATING",
        ):
            raise UsSourceParseError("callook-callsigns", "invalid Callook record")
        if record["status"] != "VALID":
            callsigns.append(_empty_callook(record["status"]))
            continue
        current = record.get("current") or {}
        callsign = current.get("callsign")
        if not callsign:
            raise UsSourceParseError(
                "callook-callsigns", "A valid lookup arrived without a current callsign"
            )
        address = record.get("address") or {}
        location = record.get("location") or {}
        other = record.get("otherInfo") or {}
        previous = record.get("previous") or {}
        trustee = record.get("trustee") or {}
        line2 = address.get("line2", "")
        callsigns.append(
            {
                "status": record["status"],
                "callsign": callsign,
                "licenseType": record.get("type", ""),
                "operatorClass": current.get("operClass", ""),
                "previousCallsign": previous.get("callsign", ""),
                "previousOperatorClass": previous.get("operClass", ""),
                "licenseeName": record.get("name", ""),
                "trusteeCallsign": trustee.get("callsign", ""),
                "trusteeName": trustee.get("name", ""),
                "addressLine1": address.get("line1", ""),
                "addressLine2": line2,
                "attention": address.get("attn", ""),
                "latitude": _callook_coordinate(location.get("latitude")),
                "longitude": _callook_coordinate(location.get("longitude")),
                "gridsquare": location.get("gridsquare", ""),
                "grantDate": _callook_date(other.get("grantDate")),
                "expiryDate": _callook_date(other.get("expiryDate")),
                "lastActionDate": _callook_date(other.get("lastActionDate")),
                "frn": other.get("frn", ""),
                "ulsUrl": other.get("ulsUrl", ""),
                "stateAbbr": _callook_state(line2),
                "callDistrict": _callook_district(callsign),
            }
        )
    valid = [row for row in callsigns if row["status"] == "VALID"]
    expiries = [row for row in valid if row["expiryDate"] is not None]
    return {
        "callsigns": callsigns,
        "callsignCount": len(callsigns),
        "validCount": len(valid),
        "invalidCount": sum(1 for row in callsigns if row["status"] == "INVALID"),
        "updatingCount": sum(1 for row in callsigns if row["status"] == "UPDATING"),
        "licenseTypeCounts": _label_counts([row["licenseType"] for row in valid]),
        "operatorClassCounts": _label_counts([row["operatorClass"] for row in valid]),
        "callDistrictCount": len(
            {row["callDistrict"] for row in valid if row["callDistrict"]}
        ),
        "soonestExpiry": min(expiries, key=lambda row: row["expiryDate"])
        if expiries
        else None,
        "latestExpiry": max(expiries, key=lambda row: row["expiryDate"])
        if expiries
        else None,
    }


_MISSING_VALUES = {"", "NA", "PS", "PRIVACYSUPPRESSED", "NULL"}
_CONTROL_LABELS = {"1": "public", "2": "private-nonprofit", "3": "private-for-profit"}
_REQUIRED_COLUMNS = [
    "UNITID",
    "OPEID",
    "INSTNM",
    "CITY",
    "STABBR",
    "INSTURL",
    "CONTROL",
    "UGDS",
    "ADM_RATE",
    "TUITIONFEE_IN",
    "TUITIONFEE_OUT",
    "DEBT_MDN",
    "C150_4",
    "RET_FT4",
    "MD_EARN_WNE_P10",
]


def _csv_text(value: str | None) -> str:
    text = "" if value is None else value.strip()
    return "" if text.upper() in _MISSING_VALUES else text


def _csv_number(value: str | None, column: str) -> float | None:
    text = _csv_text(value)
    if text == "":
        return None
    number = as_number(text)
    if number is None:
        raise UsSourceParseError(
            "college-scorecard-institutions", f"Unreadable {column} value: {text}"
        )
    return number


def _state_summary(state: str, institutions: list[dict[str, Any]]) -> dict[str, Any]:
    earnings = [
        row["medianEarnings10Years"]
        for row in institutions
        if row["medianEarnings10Years"] is not None
    ]
    debts = [row["medianDebt"] for row in institutions if row["medianDebt"] is not None]
    completions = [
        row["completionRate"]
        for row in institutions
        if row["completionRate"] is not None
    ]
    return {
        "stateAbbr": state,
        "institutionCount": len(institutions),
        "earningsReportedCount": len(earnings),
        "medianEarnings10Years": median(earnings),
        "medianDebt": median(debts),
        "medianCompletionRate": median(completions),
        "publicInstitutionCount": sum(
            1 for row in institutions if row["control"] == "public"
        ),
        "privateNonprofitInstitutionCount": sum(
            1 for row in institutions if row["control"] == "private-nonprofit"
        ),
        "privateForProfitInstitutionCount": sum(
            1 for row in institutions if row["control"] == "private-for-profit"
        ),
    }


def _pick_earning_state(rows: list[dict[str, Any]], *, highest: bool) -> dict[str, Any]:
    best = rows[0]
    for row in rows[1:]:
        value = row["medianEarnings10Years"]
        best_value = best["medianEarnings10Years"]
        if value == best_value:
            if row["stateAbbr"] < best["stateAbbr"]:
                best = row
        elif (value > best_value) if highest else (value < best_value):
            best = row
    return best


def parse_college_scorecard_csv(csv_text: str) -> dict[str, Any]:
    """Parses the College Scorecard institution CSV into a snapshot."""
    reader = csv.DictReader(io.StringIO(csv_text))
    fieldnames = reader.fieldnames or []
    missing = [column for column in _REQUIRED_COLUMNS if column not in fieldnames]
    if missing:
        raise UsSourceParseError(
            "college-scorecard-institutions",
            f"The institution file is missing the {missing[0]} column",
        )
    institutions: list[dict[str, Any]] = []
    for row in reader:
        unit_id = _csv_number(row.get("UNITID"), "UNITID")
        name = _csv_text(row.get("INSTNM"))
        if unit_id is None or name == "":
            raise UsSourceParseError(
                "college-scorecard-institutions",
                "An institution row arrived without its unit id or name",
            )
        institutions.append(
            {
                "unitId": int(unit_id),
                "opeId": _csv_text(row.get("OPEID")),
                "name": name,
                "city": _csv_text(row.get("CITY")),
                "stateAbbr": _csv_text(row.get("STABBR")),
                "institutionUrl": _csv_text(row.get("INSTURL")) or None,
                "control": _CONTROL_LABELS.get(
                    _csv_text(row.get("CONTROL")), "unknown"
                ),
                "undergraduateEnrollment": _csv_number(row.get("UGDS"), "UGDS"),
                "admissionRate": _csv_number(row.get("ADM_RATE"), "ADM_RATE"),
                "inStateTuition": _csv_number(
                    row.get("TUITIONFEE_IN"), "TUITIONFEE_IN"
                ),
                "outStateTuition": _csv_number(
                    row.get("TUITIONFEE_OUT"), "TUITIONFEE_OUT"
                ),
                "medianDebt": _csv_number(row.get("DEBT_MDN"), "DEBT_MDN"),
                "completionRate": _csv_number(row.get("C150_4"), "C150_4"),
                "retentionRate": _csv_number(row.get("RET_FT4"), "RET_FT4"),
                "medianEarnings10Years": _csv_number(
                    row.get("MD_EARN_WNE_P10"), "MD_EARN_WNE_P10"
                ),
            }
        )
    if not institutions:
        raise UsSourceParseError(
            "college-scorecard-institutions",
            "The institution file had a header but no rows",
        )
    by_state: dict[str, list[dict[str, Any]]] = {}
    for institution in institutions:
        if institution["stateAbbr"]:
            by_state.setdefault(institution["stateAbbr"], []).append(institution)
    summaries = [
        _state_summary(state, rows) for state, rows in sorted(by_state.items())
    ]
    earnings = [
        row["medianEarnings10Years"]
        for row in institutions
        if row["medianEarnings10Years"] is not None
    ]
    debts = [row["medianDebt"] for row in institutions if row["medianDebt"] is not None]
    completions = [
        row["completionRate"]
        for row in institutions
        if row["completionRate"] is not None
    ]
    reported_states = [
        summary for summary in summaries if summary["medianEarnings10Years"] is not None
    ]
    highest_earning = None
    for institution in institutions:
        if institution["medianEarnings10Years"] is None:
            continue
        if (
            highest_earning is None
            or institution["medianEarnings10Years"]
            > highest_earning["medianEarnings10Years"]
        ):
            highest_earning = institution
    return {
        "dataReleaseDate": COLLEGE_SCORECARD_DATA_RELEASE_DATE,
        "institutions": institutions,
        "institutionCount": len(institutions),
        "stateCount": len(summaries),
        "earningsReportedCount": len(earnings),
        "stateSummaries": summaries,
        "nationalMedianEarnings10Years": median(earnings),
        "nationalMedianDebt": median(debts),
        "nationalMedianCompletionRate": median(completions),
        "highestEarningState": _pick_earning_state(reported_states, highest=True)
        if reported_states
        else None,
        "lowestEarningState": _pick_earning_state(reported_states, highest=False)
        if reported_states
        else None,
        "highestEarningInstitution": highest_earning,
    }


def parse_college_scorecard_archive(payload: Any) -> dict[str, Any]:
    """Parses a CSV sample or a College Scorecard zip archive."""
    if isinstance(payload, str):
        return parse_college_scorecard_csv(payload)
    if isinstance(payload, bytes):
        return parse_college_scorecard_csv(payload.decode("utf-8"))
    raise UsSourceParseError(
        "college-scorecard-institutions", "The archive is not CSV text or bytes"
    )


def _estimate_source(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("url") is None:
        raise UsSourceParseError("estimatetax-income-tax", "A source block has no URL")
    source = {"url": value["url"]}
    for name, key in (
        ("citation", "citation"),
        ("authority", "authority"),
        ("document", "document"),
    ):
        if value.get(key) is not None:
            source[name] = value[key]
    checked = value.get("checked", value.get("verified"))
    if checked is not None:
        source["checkedDate"] = checked
    return source


def parse_estimatetax_calculation(payload: Any) -> dict[str, Any]:
    """Parses one EstimateTax calculation into the port shape."""
    parsed = require_dict(payload, "estimatetax-income-tax")
    input_raw = require_dict(parsed.get("input"), "estimatetax-income-tax")
    federal = require_dict(parsed.get("federal"), "estimatetax-income-tax")
    totals = require_dict(parsed.get("totals"), "estimatetax-income-tax")
    sources = require_dict(parsed.get("sources"), "estimatetax-income-tax")
    state = parsed.get("state")
    local = parsed.get("local")
    return {
        "taxYear": parsed["taxYear"],
        "input": {
            "income": input_raw["income"],
            "filingStatus": input_raw["filingStatus"],
            "state": input_raw.get("state"),
            "city": input_raw.get("city"),
            "preTaxDeductions": input_raw.get("preTaxDeductions", 0),
            "selfEmploymentIncome": input_raw.get("selfEmploymentIncome", 0),
        },
        "federal": {
            "incomeTax": federal["incomeTax"],
            "totalFica": federal["totalFica"],
            "marginalRate": federal["marginalRate"],
            "brackets": [
                {
                    "rate": bracket["rate"],
                    "taxableIncome": bracket["taxableInBracket"],
                    "tax": bracket["tax"],
                }
                for bracket in federal["brackets"]
            ],
        },
        "state": None
        if state is None
        else {
            "code": state["code"],
            "name": state["name"],
            "tax": state["tax"],
            "system": state["system"],
        },
        "local": None
        if local is None
        else {
            "jurisdiction": local["jurisdiction"],
            "tax": local["tax"],
            "rate": local["rate"],
            "base": local["base"],
        },
        "totals": {
            "totalTax": totals["totalTax"],
            "netIncome": totals["netIncome"],
            "effectiveRate": totals["effectiveRate"],
            "effectiveIncomeTaxRate": totals["effectiveIncomeTaxRate"],
        },
        "sources": {
            "federal": _estimate_source(sources.get("federal")),
            "state": None
            if sources.get("state") is None
            else _estimate_source(sources["state"]),
            "local": None
            if sources.get("local") is None
            else _estimate_source(sources["local"]),
        },
    }


def _callook_fetch(options: Mapping[str, Any] | None = None) -> dict[str, Any]:
    callsigns = [
        "W1ABC",
        "W2ABC",
        "W3ABC",
        "W4ABC",
        "W5ABC",
        "W6ABC",
        "W7ABC",
        "W8ABC",
        "W9ABC",
        "W0ABC",
    ]
    return parse_callook_callsigns_payload(
        [get_json(f"{CALLOOK_API_BASE}/{callsign}/json") for callsign in callsigns]
    )


def _college_fetch(options: Mapping[str, Any] | None = None) -> dict[str, Any]:
    from .http import get_text

    return parse_college_scorecard_csv(
        get_text(COLLEGE_SCORECARD_INSTITUTION_ARCHIVE_URL)
    )


def _estimate_fetch(options: Mapping[str, Any] | None = None) -> dict[str, Any]:
    query = urlencode(
        {
            "income": "85000",
            "filingStatus": "single",
            "state": "NY",
            "city": "new-york-city",
        }
    )
    return parse_estimatetax_calculation(
        get_json(f"{ESTIMATETAX_API_BASE}/api/v1/calculate?{query}")
    )


callook_callsigns_adapter = UsDataAdapter(
    id="callook-callsigns",
    name="Callook callsigns",
    auth="none",
    description="US amateur radio callsign records from the FCC licence file, looked up through Callook.info, with the licence class, address, location, and expiry for each callsign.",
    fetch_live=_callook_fetch,
    parse=parse_callook_callsigns_payload,
    load_fixture=lambda: parse_callook_callsigns_payload(
        read_fixture_json("callook-callsigns-2026-10-21.json")
    ),
)

college_scorecard_institutions_adapter = UsDataAdapter(
    id="college-scorecard-institutions",
    name="College Scorecard institutions",
    auth="none",
    description="Institution-level College Scorecard data, one row per institution, with enrollment, cost, completion, debt, and earnings.",
    fetch_live=_college_fetch,
    parse=parse_college_scorecard_archive,
    load_fixture=lambda: parse_college_scorecard_csv(
        read_fixture_text("college-scorecard-institutions-2026-10-15-sampled.csv")
    ),
)

estimatetax_income_tax_adapter = UsDataAdapter(
    id="estimatetax-income-tax",
    name="EstimateTax US income tax",
    auth="none",
    description="US federal, state, and local income tax for one salary, with the official document behind every figure.",
    fetch_live=_estimate_fetch,
    parse=parse_estimatetax_calculation,
    load_fixture=lambda: parse_estimatetax_calculation(
        read_fixture_json("estimatetax-income-tax-2026-10-18.json")
    ),
)
