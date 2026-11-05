"""Treasury, consumer complaint, recall, and food enforcement adapters."""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlencode

from .common import UsDataAdapter, as_number, require_dict, require_list
from .errors import UsSourceApiError, UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json

TREASURY_FISCAL_DATA_API_BASE = (
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
)
CFPB_COMPLAINT_SEARCH_API_BASE = (
    "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"
)
CPSC_RECALL_API_BASE = "https://www.saferproducts.gov/RestWebServices/Recall"
OPENFDA_FOOD_ENFORCEMENT_BASE = "https://api.fda.gov/food/enforcement.json"


def parse_treasury_avg_interest_rate_payload(payload: Any) -> list[dict[str, Any]]:
    """Parses Treasury monthly average-interest-rate rows."""
    parsed = require_dict(payload, "treasury")
    if parsed.get("error") is not None:
        raise UsSourceApiError(
            "treasury", str(parsed.get("message") or parsed.get("error"))
        )
    months: list[dict[str, Any]] = []
    for row in require_list(parsed.get("data"), "treasury"):
        if not isinstance(row, dict) or not isinstance(row.get("record_date"), str):
            raise UsSourceParseError("treasury", "A row carries no record date")
        match = re.fullmatch(r"(\d{4})-(\d{2})-\d{2}", row["record_date"])
        if match is None:
            raise UsSourceParseError(
                "treasury", f"Unreadable record date: {row['record_date']}"
            )
        value = as_number(row.get("avg_interest_rate_amt"))
        if value is None:
            continue
        months.append(
            {
                "recordDate": row["record_date"],
                "year": int(match.group(1)),
                "month": int(match.group(2)),
                "averageInterestRatePercent": value,
            }
        )
    if not months:
        raise UsSourceParseError("treasury", "No monthly values in the response")
    return months


def build_treasury_avg_interest_rate_series(payload: Any) -> dict[str, Any]:
    """Builds the Treasury average-interest-rate series."""
    months = sorted(
        parse_treasury_avg_interest_rate_payload(payload),
        key=lambda row: row["recordDate"],
    )
    first, last = months[0], months[-1]
    highest = max(months, key=lambda row: row["averageInterestRatePercent"])
    lowest = min(months, key=lambda row: row["averageInterestRatePercent"])
    return {
        "months": months,
        "monthCount": len(months),
        "firstMonth": first,
        "lastMonth": last,
        "highest": highest,
        "lowest": lowest,
        "changeSinceLowPercentPoints": last["averageInterestRatePercent"]
        - lowest["averageInterestRatePercent"],
        "changeFirstToLastPercentPoints": last["averageInterestRatePercent"]
        - first["averageInterestRatePercent"],
    }


def _treasury_amount(value: Any) -> float | None:
    if value is None or str(value).strip().lower() == "null":
        return None
    return as_number(value)


def parse_treasury_debt_to_penny_payload(payload: Any) -> list[dict[str, Any]]:
    """Parses Treasury debt-to-the-penny rows."""
    parsed = require_dict(payload, "treasury-debt-to-penny")
    if parsed.get("error") is not None:
        raise UsSourceApiError(
            "treasury-debt-to-penny", str(parsed.get("message") or parsed.get("error"))
        )
    days: list[dict[str, Any]] = []
    for row in require_list(parsed.get("data"), "treasury-debt-to-penny"):
        if not isinstance(row, dict) or not isinstance(row.get("record_date"), str):
            raise UsSourceParseError(
                "treasury-debt-to-penny", "A row carries no record date"
            )
        total = _treasury_amount(row.get("tot_pub_debt_out_amt"))
        if total is None:
            continue
        days.append(
            {
                "recordDate": row["record_date"],
                "totalPublicDebtOutstandingUsd": total,
                "debtHeldByPublicUsd": _treasury_amount(
                    row.get("debt_held_public_amt")
                ),
                "intragovernmentalHoldingsUsd": _treasury_amount(
                    row.get("intragov_hold_amt")
                ),
            }
        )
    if not days:
        raise UsSourceParseError(
            "treasury-debt-to-penny", "No daily values in the response"
        )
    return days


def build_treasury_debt_to_penny_page(payload: Any) -> dict[str, Any]:
    """Builds the Treasury debt page with its first, last, highest, and lowest days."""
    days = sorted(
        parse_treasury_debt_to_penny_payload(payload), key=lambda row: row["recordDate"]
    )
    return {
        "days": days,
        "dayCount": len(days),
        "firstDay": days[0],
        "lastDay": days[-1],
        "highestTotalDebt": max(
            days, key=lambda row: row["totalPublicDebtOutstandingUsd"]
        ),
        "lowestTotalDebt": min(
            days, key=lambda row: row["totalPublicDebtOutstandingUsd"]
        ),
    }


def _extreme(rows: list[dict[str, Any]], key: str, maximum: bool) -> dict[str, Any]:
    return (max if maximum else min)(rows, key=lambda row: row[key])


def build_cfp_consumer_complaint_series(payload: Any) -> dict[str, Any]:
    """Builds the CFPB complaint snapshot and named years."""
    parsed = require_dict(payload, "cfpb-consumer-complaints")
    years = require_list(parsed.get("years"), "cfpb-consumer-complaints")
    if not years:
        raise UsSourceParseError("cfpb-consumer-complaints", "No years to summarise")
    newest_year = int(parsed["newestYear"])
    complete = [row for row in years if row["year"] != newest_year]
    total = sum(int(row["complaintCount"]) for row in years)
    if total == 0 or not complete:
        raise UsSourceParseError(
            "cfpb-consumer-complaints", "No complaints to summarise"
        )
    return {
        "firstYear": int(parsed["firstYear"]),
        "newestYear": newest_year,
        "newestReceivedDate": str(parsed["newestReceivedDate"]),
        "totalComplaints": total,
        "years": years,
        "completeYearCount": len(complete),
        "busiestCompleteYear": _extreme(complete, "complaintCount", True),
        "quietestCompleteYear": _extreme(complete, "complaintCount", False),
        "topProducts": parsed.get("topProducts", []),
        "topCompanies": parsed.get("topCompanies", []),
    }


def build_cpsc_product_recall_series(payload: Any) -> dict[str, Any]:
    """Builds the CPSC recall snapshot and named years."""
    parsed = require_dict(payload, "cpsc-product-recalls")
    years = require_list(parsed.get("years"), "cpsc-product-recalls")
    if not years:
        raise UsSourceParseError("cpsc-product-recalls", "No years to summarise")
    newest_year = int(parsed["newestYear"])
    complete = [row for row in years if row["year"] != newest_year]
    if not complete:
        raise UsSourceParseError(
            "cpsc-product-recalls", "No complete year to compare against"
        )
    if sum(int(row["recallCount"]) for row in years) != int(parsed["totalRecalls"]):
        raise UsSourceParseError(
            "cpsc-product-recalls", "Year counts do not add to the file total"
        )
    return {
        "firstYear": int(parsed["firstYear"]),
        "newestYear": newest_year,
        "newestRecallDate": str(parsed["newestRecallDate"]),
        "totalRecalls": int(parsed["totalRecalls"]),
        "years": years,
        "completeYearCount": len(complete),
        "busiestCompleteYear": _extreme(complete, "recallCount", True),
        "quietestCompleteYear": _extreme(complete, "recallCount", False),
        "remedyOptions": parsed.get("remedyOptions", []),
        "manufacturerCountries": parsed.get("manufacturerCountries", []),
    }


def _date_label(value: str) -> str:
    if re.fullmatch(r"\d{8}", value) is None:
        raise UsSourceParseError("openfda", f"Unreadable publication date: {value}")
    return f"{value[:4]}-{value[4:6]}-{value[6:]}"


def build_openfda_food_recall_summary(payload: Any) -> dict[str, Any]:
    """Builds the openFDA food recall summary and yearly counts."""
    parsed = require_dict(payload, "openfda")
    report_dates = require_list(parsed.get("reportDates"), "openfda")
    if not report_dates:
        raise UsSourceParseError("openfda", "No publication dates to summarise")
    recall_count = int(parsed["recallCount"])
    dated_total = sum(int(entry["count"]) for entry in report_dates)
    if dated_total != recall_count:
        raise UsSourceParseError(
            "openfda", "Publication dates do not cover the recall count"
        )
    class_one_dates = parsed.get("classOneDates", [])
    total_by_year: dict[int, int] = {}
    class_one_by_year: dict[int, int] = {}
    for entry in report_dates:
        year = int(str(entry["time"])[:4])
        total_by_year[year] = total_by_year.get(year, 0) + int(entry["count"])
    for entry in class_one_dates:
        year = int(str(entry["time"])[:4])
        class_one_by_year[year] = class_one_by_year.get(year, 0) + int(entry["count"])
    years = [
        {
            "year": year,
            "total": total,
            "classOne": class_one_by_year.get(year, 0),
            "other": total - class_one_by_year.get(year, 0),
        }
        for year, total in sorted(total_by_year.items())
    ]
    classifications = [
        {"name": entry["term"], "count": int(entry["count"])}
        for entry in parsed.get("classifications", [])
    ]
    voluntary = [
        {"name": entry["term"], "count": int(entry["count"])}
        for entry in parsed.get("voluntary", [])
    ]
    voluntary_count = next(
        (
            row["count"]
            for row in voluntary
            if row["name"] == "Voluntary: Firm initiated"
        ),
        0,
    )
    mandated_count = next(
        (row["count"] for row in voluntary if row["name"] == "FDA Mandated"), 0
    )
    return {
        "recallCount": recall_count,
        "reportDateCount": len(report_dates),
        "firstReportDate": _date_label(str(report_dates[0]["time"])),
        "newestReportDate": _date_label(str(report_dates[-1]["time"])),
        "firstYear": years[0]["year"],
        "newestYear": years[-1]["year"],
        "newestYearCount": years[-1]["total"],
        "years": years,
        "busiestYear": _extreme(years, "total", True),
        "classOneCount": sum(int(entry["count"]) for entry in class_one_dates),
        "classOneSharePercent": sum(int(entry["count"]) for entry in class_one_dates)
        / recall_count
        * 100,
        "classifications": classifications,
        "voluntaryCount": voluntary_count,
        "mandatedCount": mandated_count,
    }


def _json_fetcher(url: str, parser: Any) -> Any:
    def fetch_live(options: Mapping[str, Any] | None = None) -> Any:
        return parser(get_json(url))

    return fetch_live


_TREASURY_AVG_PATH = "/v2/accounting/od/avg_interest_rates"
_TREASURY_DEBT_PATH = "/v2/accounting/od/debt_to_penny"


def _treasury_avg_url() -> str:
    query = urlencode(
        {
            "filter": "security_type_desc:eq:Marketable,security_desc:eq:Total Interest-bearing Debt",
            "sort": "record_date",
            "page[size]": "10000",
        }
    )
    return f"{TREASURY_FISCAL_DATA_API_BASE}{_TREASURY_AVG_PATH}?{query}"


def _treasury_debt_url() -> str:
    return f"{TREASURY_FISCAL_DATA_API_BASE}{_TREASURY_DEBT_PATH}?page[size]=10&sort=record_date"


def _cfpb_url() -> str:
    return f"{CFPB_COMPLAINT_SEARCH_API_BASE}?size=0&no_aggs=true"


def _cpsc_url() -> str:
    year = dt.datetime.now(tz=dt.timezone.utc).year
    query = urlencode(
        {
            "format": "json",
            "RecallDateStart": f"{year}-01-01",
            "RecallDateEnd": f"{year}-12-31",
        }
    )
    return f"{CPSC_RECALL_API_BASE}?{query}"


def _openfda_url() -> str:
    return f"{OPENFDA_FOOD_ENFORCEMENT_BASE}?limit=1"


treasury_avg_interest_rate_adapter = UsDataAdapter(
    id="treasury-avg-interest-rate",
    name="US Treasury average interest rate",
    auth="none",
    description="The average interest rate on US Treasury interest-bearing debt, one row per month.",
    fetch_live=_json_fetcher(
        _treasury_avg_url(), build_treasury_avg_interest_rate_series
    ),
    parse=build_treasury_avg_interest_rate_series,
    load_fixture=lambda: build_treasury_avg_interest_rate_series(
        read_fixture_json("treasury-avg-interest-rate-2026-09-28.json")
    ),
)

treasury_debt_to_penny_adapter = UsDataAdapter(
    id="treasury-debt-to-penny",
    name="US Treasury debt to the penny",
    auth="none",
    description="Daily US public debt outstanding to the penny, one row per business day.",
    fetch_live=_json_fetcher(_treasury_debt_url(), build_treasury_debt_to_penny_page),
    parse=build_treasury_debt_to_penny_page,
    load_fixture=lambda: build_treasury_debt_to_penny_page(
        read_fixture_json("treasury-debt-to-penny-2026-10-05.json")
    ),
)

cfpb_consumer_complaints_adapter = UsDataAdapter(
    id="cfpb-consumer-complaints",
    name="CFPB consumer complaints",
    auth="none",
    description="Every consumer complaint the Consumer Financial Protection Bureau has sent to a company, counted by year, with the products and companies named most often.",
    fetch_live=_json_fetcher(_cfpb_url(), build_cfp_consumer_complaint_series),
    parse=build_cfp_consumer_complaint_series,
    load_fixture=lambda: build_cfp_consumer_complaint_series(
        read_fixture_json("cfpb-consumer-complaints-2026-10-03.json")
    ),
)

cpsc_product_recalls_adapter = UsDataAdapter(
    id="cpsc-product-recalls",
    name="CPSC product recalls",
    auth="none",
    description="Every consumer product recall the Consumer Product Safety Commission has published, one row per recall, with the remedy offered and the countries that made the product.",
    fetch_live=_json_fetcher(_cpsc_url(), build_cpsc_product_recall_series),
    parse=build_cpsc_product_recall_series,
    load_fixture=lambda: build_cpsc_product_recall_series(
        read_fixture_json("cpsc-product-recalls-2026-10-02.json")
    ),
)

openfda_food_recalls_adapter = UsDataAdapter(
    id="openfda-food-recalls",
    name="openFDA food enforcement reports",
    auth="none",
    description="Every food recall FDA has published as an enforcement report, one record per recall, from June 2012 to the newest publication date.",
    fetch_live=_json_fetcher(_openfda_url(), build_openfda_food_recall_summary),
    parse=build_openfda_food_recall_summary,
    load_fixture=lambda: build_openfda_food_recall_summary(
        read_fixture_json("openfda-food-recalls-2026-09-30.json")
    ),
)
