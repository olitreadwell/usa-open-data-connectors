"""Socrata catalogue adapters."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import UsDataAdapter
from .errors import UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json


def _catalogue_entries(payload: Any, source: str) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or len(payload) == 0:
        raise UsSourceParseError(source, "The response carried no entries")
    entries: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            raise UsSourceParseError(source, "A catalogue entry is not an object")
        if "id" not in row or "name" not in row or "createdAt" not in row:
            raise UsSourceParseError(
                source,
                "A catalogue entry arrived without its id, name, or creation time",
            )
        created = row["createdAt"]
        entries.append(
            {
                "id": row["id"],
                "name": row["name"],
                "assetType": row.get("assetType", ""),
                "category": row.get("category"),
                "viewType": row.get("viewType", ""),
                "createdAtEpochSeconds": created,
                "viewLastModifiedEpochSeconds": row.get("viewLastModified", created),
                "viewCount": row.get("viewCount", 0),
                "downloadCount": row.get("downloadCount", 0),
            }
        )
    return entries


def _categories(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for entry in entries:
        category = entry["category"] or "Uncategorised"
        counts[category] = counts.get(category, 0) + 1
    return [
        {"category": category, "entryCount": count}
        for category, count in sorted(
            counts.items(), key=lambda item: (-item[1], item[0])
        )
    ]


def _newest(entries: list[dict[str, Any]]) -> dict[str, Any]:
    return max(entries, key=lambda entry: entry["createdAtEpochSeconds"])


def parse_catalogue_payload(
    payload: Any, source: str, *, city_catalogue: bool = False
) -> dict[str, Any]:
    """Parses one Socrata catalogue page."""
    entries = _catalogue_entries(payload, source)
    result: dict[str, Any] = {
        "entries": entries,
        "entryCount": len(entries),
        "datasetCount": sum(1 for entry in entries if entry["assetType"] == "dataset"),
        "newestEntry": _newest(entries),
        "categories": _categories(entries),
    }
    if city_catalogue:
        result.update(
            {
                "mapCount": sum(1 for entry in entries if entry["assetType"] == "map"),
                "mostViewedEntry": max(entries, key=lambda entry: entry["viewCount"]),
                "mostDownloadedEntry": max(
                    entries, key=lambda entry: entry["downloadCount"]
                ),
                "totalViewCount": sum(entry["viewCount"] for entry in entries),
                "totalDownloadCount": sum(entry["downloadCount"] for entry in entries),
            }
        )
    return result


def _catalogue_adapter(
    source_id: str,
    name: str,
    description: str,
    url: str,
    fixture: str,
    *,
    city_catalogue: bool = False,
) -> UsDataAdapter:
    def parse(payload: Any) -> dict[str, Any]:
        return parse_catalogue_payload(
            payload, source_id, city_catalogue=city_catalogue
        )

    def fetch_live(options: Mapping[str, Any] | None = None) -> dict[str, Any]:
        return parse(get_json(url))

    return UsDataAdapter(
        id=source_id,
        name=name,
        auth="none",
        description=description,
        fetch_live=fetch_live,
        parse=parse,
        load_fixture=lambda: parse(read_fixture_json(fixture)),
    )


BTS_TRANSPORTATION_STATS_API_BASE = "https://data.bts.gov/api/views.json"
CDC_SOCRATA_CATALOGUE_API_BASE = "https://data.cdc.gov/api/views.json"
HEALTHDATA_SOCRATA_CATALOGUE_API_BASE = "https://healthdata.gov/api/views.json"
NYC_OPEN_DATA_API_BASE = "https://data.cityofnewyork.us/api/views.json"

bts_transportation_stats_adapter = _catalogue_adapter(
    "bts-transportation-stats",
    "BTS transportation statistics",
    "The Bureau of Transportation Statistics Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.",
    f"{BTS_TRANSPORTATION_STATS_API_BASE}?limit=10",
    "bts-transportation-stats-2026-10-05.json",
)

cdc_socrata_catalogue_adapter = _catalogue_adapter(
    "cdc-socrata-catalogue",
    "CDC Socrata catalogue",
    "The CDC's Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.",
    f"{CDC_SOCRATA_CATALOGUE_API_BASE}?limit=10",
    "cdc-socrata-catalogue-2026-10-05.json",
)

healthdata_socrata_catalogue_adapter = _catalogue_adapter(
    "healthdata-socrata-catalogue",
    "HealthData.gov catalogue",
    "The HealthData.gov Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.",
    f"{HEALTHDATA_SOCRATA_CATALOGUE_API_BASE}?limit=10",
    "healthdata-socrata-catalogue-2026-10-05.json",
)

nyc_open_data_catalogue_adapter = _catalogue_adapter(
    "nyc-open-data-catalogue",
    "NYC Open Data catalogue",
    "The New York City open data catalogue on Socrata, one row per published dataset or map, with its city topic, view count, and download count.",
    f"{NYC_OPEN_DATA_API_BASE}?limit=50",
    "nyc-open-data-catalogue-2026-10-19.json",
    city_catalogue=True,
)
