"""FEMA, USAspending, and SEC adapters."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from .common import UsDataAdapter, as_number, require_dict, require_list
from .errors import UsSourceApiError, UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json

FEMA_OPEN_DATA_API_BASE = "https://www.fema.gov/api/open/v1"
USASPENDING_API_BASE = "https://api.usaspending.gov/api/v2"
SEC_EDGAR_SUBMISSIONS_API_BASE = "https://data.sec.gov/submissions"


def _count_named(values: list[str]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return [
        {"name": key, "count": count}
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def parse_fema_declaration_payload(payload: Any) -> list[dict[str, Any]]:
    """Parses OpenFEMA declaration rows."""
    parsed = require_dict(payload, "fema")
    errors = parsed.get("error")
    if isinstance(errors, list) and errors:
        first = errors[0] if isinstance(errors[0], dict) else {}
        raise UsSourceApiError(
            "fema", str(first.get("message") or first.get("code") or "rejected")
        )
    rows = require_list(parsed.get("FemaWebDisasterDeclarations"), "fema")
    if not rows:
        raise UsSourceParseError("fema", "The response carried no declarations")
    metadata = parsed.get("metadata")
    reported = metadata.get("count") if isinstance(metadata, dict) else None
    if isinstance(reported, int) and reported > len(rows):
        raise UsSourceParseError("fema", "The response was truncated")
    declarations: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        required = (
            "disasterNumber",
            "declarationDate",
            "declarationType",
            "incidentType",
            "stateCode",
            "stateName",
        )
        if any(row.get(key) is None for key in required):
            raise UsSourceParseError("fema", "A declaration row is missing a field")
        declaration_date = str(row["declarationDate"])
        match = re.match(r"^(\d{4})-", declaration_date)
        if match is None:
            raise UsSourceParseError(
                "fema", f"Unreadable declaration date: {declaration_date}"
            )
        declarations.append(
            {
                "disasterNumber": row["disasterNumber"],
                "declarationDate": declaration_date,
                "year": int(match.group(1)),
                "declarationType": row["declarationType"],
                "incidentType": row["incidentType"],
                "stateCode": row["stateCode"],
                "stateName": row["stateName"],
            }
        )
    return declarations


def build_fema_declaration_catalogue(payload: Any) -> dict[str, Any]:
    """Builds the FEMA declaration catalogue and its counts."""
    declarations = sorted(
        parse_fema_declaration_payload(payload), key=lambda row: row["year"]
    )
    if not declarations:
        raise UsSourceParseError("fema", "No declarations to summarise")
    years_by_number: dict[int, dict[str, Any]] = {}
    for declaration in declarations:
        year = declaration["year"]
        row = years_by_number.setdefault(year, {"year": year, "total": 0, "fire": 0})
        row["total"] += 1
        if declaration["incidentType"] == "Fire":
            row["fire"] += 1
    years = [years_by_number[year] for year in sorted(years_by_number)]
    fires = [
        declaration
        for declaration in declarations
        if declaration["incidentType"] == "Fire"
    ]
    return {
        "declarations": declarations,
        "declarationCount": len(declarations),
        "firstYear": declarations[0]["year"],
        "newestYear": declarations[-1]["year"],
        "years": years,
        "busiestYear": max(years, key=lambda row: row["total"]),
        "fireCount": len(fires),
        "firstFireYear": fires[0]["year"] if fires else declarations[0]["year"],
        "incidentTypes": _count_named([row["incidentType"] for row in declarations]),
        "declarationTypes": _count_named(
            [row["declarationType"] for row in declarations]
        ),
        "topStates": _count_named([row["stateCode"] for row in declarations]),
    }


def parse_usaspending_agencies_payload(payload: Any) -> dict[str, Any]:
    """Parses the USAspending top-tier agency directory."""
    parsed = require_dict(payload, "usaspending-agencies")
    rows = require_list(parsed.get("results"), "usaspending-agencies")
    if not rows:
        raise UsSourceParseError(
            "usaspending-agencies", "The response carried no agencies"
        )
    agencies: list[dict[str, Any]] = []
    for row in rows:
        if (
            not isinstance(row, dict)
            or row.get("agency_id") is None
            or row.get("agency_name") is None
        ):
            raise UsSourceParseError(
                "usaspending-agencies", "An agency row arrived without its id or name"
            )
        agencies.append(
            {
                "agencyId": row["agency_id"],
                "toptierCode": row.get("toptier_code", ""),
                "abbreviation": row.get("abbreviation", ""),
                "agencyName": row["agency_name"],
                "activeFiscalYear": row.get("active_fy", ""),
                "activeFiscalQuarter": row.get("active_fq", ""),
                "outlayAmount": as_number(row.get("outlay_amount")) or 0,
                "obligatedAmount": as_number(row.get("obligated_amount")) or 0,
                "budgetAuthorityAmount": as_number(row.get("budget_authority_amount"))
                or 0,
                "currentTotalBudgetAuthorityAmount": as_number(
                    row.get("current_total_budget_authority_amount")
                )
                or 0,
                "percentageOfTotalBudgetAuthority": as_number(
                    row.get("percentage_of_total_budget_authority")
                )
                or 0,
                "agencySlug": row.get("agency_slug", ""),
                "congressionalJustificationUrl": row.get(
                    "congressional_justification_url"
                ),
            }
        )
    first = agencies[0]
    return {
        "agencies": agencies,
        "agencyCount": len(agencies),
        "fiscalYear": first["activeFiscalYear"],
        "fiscalQuarter": first["activeFiscalQuarter"],
        "currentTotalBudgetAuthorityAmount": first["currentTotalBudgetAuthorityAmount"],
        "largestByObligation": max(agencies, key=lambda row: row["obligatedAmount"]),
        "largestByOutlay": max(agencies, key=lambda row: row["outlayAmount"]),
    }


def _blank_to_none(value: Any) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    return str(value)


def parse_sec_edgar_filings_payload(payload: Any) -> dict[str, Any]:
    """Parses an SEC EDGAR submissions response into issuer filings."""
    parsed = require_dict(payload, "sec-edgar-filings")
    filings_block = parsed.get("filings")
    recent = filings_block.get("recent") if isinstance(filings_block, dict) else None
    if not isinstance(recent, dict):
        raise UsSourceParseError("sec-edgar-filings", "The response carried no filings")
    accessions = recent.get("accessionNumber") or []
    columns = {
        "filingDate": recent.get("filingDate") or [],
        "reportDate": recent.get("reportDate") or [],
        "form": recent.get("form") or [],
        "size": recent.get("size") or [],
        "isXBRL": recent.get("isXBRL") or [],
        "isInlineXBRL": recent.get("isInlineXBRL") or [],
        "primaryDocument": recent.get("primaryDocument") or [],
        "primaryDocDescription": recent.get("primaryDocDescription") or [],
    }
    for name, values in columns.items():
        if len(values) != len(accessions):
            raise UsSourceParseError(
                "sec-edgar-filings", f"The {name} column has a different length"
            )
    filings: list[dict[str, Any]] = []
    for index, accession in enumerate(accessions):
        filing_date = str(columns["filingDate"][index])
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", filing_date) is None:
            raise UsSourceParseError(
                "sec-edgar-filings", f"Unreadable filing date: {filing_date}"
            )
        filings.append(
            {
                "accessionNumber": accession,
                "filingDate": filing_date,
                "reportDate": _blank_to_none(columns["reportDate"][index]),
                "form": columns["form"][index],
                "primaryDocument": columns["primaryDocument"][index],
                "primaryDocDescription": _blank_to_none(
                    columns["primaryDocDescription"][index]
                ),
                "sizeBytes": columns["size"][index],
                "isXbrl": columns["isXBRL"][index] == 1,
                "isInlineXbrl": columns["isInlineXBRL"][index] == 1,
            }
        )
    if not filings:
        raise UsSourceParseError("sec-edgar-filings", "The response carried no filings")
    return {
        "cik": parsed.get("cik", ""),
        "name": parsed.get("name", ""),
        "entityType": _blank_to_none(parsed.get("entityType")),
        "sic": _blank_to_none(parsed.get("sic")),
        "sicDescription": _blank_to_none(parsed.get("sicDescription")),
        "tickers": parsed.get("tickers", []),
        "exchanges": parsed.get("exchanges", []),
        "fiscalYearEnd": _blank_to_none(parsed.get("fiscalYearEnd")),
        "filings": filings,
        "filingCount": len(filings),
        "newestFilingDate": max(row["filingDate"] for row in filings),
        "formCounts": [
            {"form": form, "count": count}
            for form, count in sorted(
                {
                    form: sum(1 for row in filings if row["form"] == form)
                    for form in {row["form"] for row in filings}
                }.items(),
                key=lambda item: (-item[1], item[0]),
            )
        ],
    }


def _json_fetcher(url: str, parser: Any) -> Any:
    def fetch_live(options: Mapping[str, Any] | None = None) -> Any:
        return parser(get_json(url))

    return fetch_live


fema_disaster_declarations_adapter = UsDataAdapter(
    id="fema-disaster-declarations",
    name="FEMA disaster declarations",
    auth="none",
    description="Every disaster declaration FEMA has published, one row per declaration, from 1953 to the newest declaration.",
    fetch_live=_json_fetcher(
        f"{FEMA_OPEN_DATA_API_BASE}/FemaWebDisasterDeclarations?$top=10000",
        build_fema_declaration_catalogue,
    ),
    parse=build_fema_declaration_catalogue,
    load_fixture=lambda: build_fema_declaration_catalogue(
        read_fixture_json("fema-disaster-declarations-2026-09-29.json")
    ),
)

usaspending_agencies_adapter = UsDataAdapter(
    id="usaspending-agencies",
    name="USAspending agencies",
    auth="none",
    description="Top-tier federal agencies from USAspending, one row per agency, with its budget, outlays, and obligations.",
    fetch_live=_json_fetcher(
        f"{USASPENDING_API_BASE}/references/toptier_agencies",
        parse_usaspending_agencies_payload,
    ),
    parse=parse_usaspending_agencies_payload,
    load_fixture=lambda: parse_usaspending_agencies_payload(
        read_fixture_json("usaspending-agencies-2026-10-05.json")
    ),
)

sec_edgar_filings_adapter = UsDataAdapter(
    id="sec-edgar-filings",
    name="SEC EDGAR filings",
    auth="none",
    description="An issuer's recent filing history from SEC EDGAR, one row per filing, with the form type and the newest date in the list.",
    fetch_live=_json_fetcher(
        f"{SEC_EDGAR_SUBMISSIONS_API_BASE}/CIK0000320193.json",
        parse_sec_edgar_filings_payload,
    ),
    parse=parse_sec_edgar_filings_payload,
    load_fixture=lambda: parse_sec_edgar_filings_payload(
        read_fixture_json("sec-edgar-filings-2026-10-05.json")
    ),
)
