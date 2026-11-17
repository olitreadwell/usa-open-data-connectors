"""Socrata and CKAN catalogue adapters."""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping
from typing import Any

from .common import UsDataAdapter, require_dict
from .errors import UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json


def _common_core_text(groups: dict[str, Any], key: str) -> str:
    """Reads one string from the portal's Common Core metadata groups."""
    for group_name in ("Common Core", "Common Core 3"):
        group = groups.get(group_name)
        if isinstance(group, dict):
            value = group.get(key)
            if value is not None:
                return value.strip() if isinstance(value, str) else ""
    return ""


def _catalogue_metadata(row: dict[str, Any]) -> dict[str, str]:
    """Reads the licence and publisher a Socrata entry carries."""
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        return {"licenceUrl": "", "attribution": ""}
    groups = metadata.get("custom_fields")
    if not isinstance(groups, dict):
        return {"licenceUrl": "", "attribution": ""}
    return {
        "licenceUrl": _common_core_text(groups, "License"),
        "attribution": _common_core_text(groups, "Publisher"),
    }


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
                **_catalogue_metadata(row),
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


def _parse_ckan_timestamp(source: str, value: str, field: str) -> int:
    """Reads one CKAN timestamp as seconds since the Unix epoch."""
    normalized = value if re.search(r"(?:Z|[+-]\d{2}:?\d{2})$", value) else f"{value}Z"
    try:
        parsed = dt.datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as error:
        raise UsSourceParseError(
            source, f"A catalogue entry carried an invalid {field}"
        ) from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return int(parsed.timestamp())


def _ckan_text(value: Any) -> str:
    """Returns a trimmed string, or an empty string for a non-string value."""
    return value.strip() if isinstance(value, str) else ""


def _ckan_licence(row: dict[str, Any]) -> str:
    """Reads a CKAN licence URL, falling back to its title."""
    licence_url = row.get("license_url")
    if licence_url is not None:
        return _ckan_text(licence_url)
    return _ckan_text(row.get("license_title"))


def _ckan_attribution(row: dict[str, Any]) -> str:
    """Reads a CKAN organisation title."""
    organization = row.get("organization")
    if not isinstance(organization, dict):
        return ""
    return _ckan_text(organization.get("title"))


def _ckan_category(source: str, row: dict[str, Any]) -> str | None:
    """Reads the first CKAN group title, or None when the package has none."""
    groups = row.get("groups")
    if groups is None:
        return None
    if not isinstance(groups, list):
        raise UsSourceParseError(source, "A catalogue entry carried malformed groups")
    if not groups:
        return None
    first = groups[0]
    if not isinstance(first, dict):
        raise UsSourceParseError(source, "A catalogue entry carried a malformed group")
    title = first.get("title")
    return title if isinstance(title, str) else None


def _ckan_resource_count(source: str, row: dict[str, Any]) -> int:
    """Reads the number of resources a CKAN package carries."""
    count = row.get("num_resources")
    if count is not None:
        if not isinstance(count, int) or isinstance(count, bool):
            raise UsSourceParseError(source, "A catalogue entry carried an invalid resource total")
        return count
    resources = row.get("resources")
    return len(resources) if isinstance(resources, list) else 0


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


def parse_california_open_data_catalogue_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of the California CKAN package search."""
    source = "california-open-data-catalogue"
    parsed = require_dict(payload, source)
    result = parsed.get("result")
    if parsed.get("success") is not True or not isinstance(result, dict):
        raise UsSourceParseError(source, "The response is not a CKAN package search")
    count = result.get("count")
    rows = result.get("results")
    if (
        not isinstance(count, int)
        or isinstance(count, bool)
        or not isinstance(rows, list)
    ):
        raise UsSourceParseError(source, "The response carried no catalogue total or results")
    if not rows:
        raise UsSourceParseError(source, "The response carried no entries")

    entries: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise UsSourceParseError(source, "A catalogue entry is not an object")
        required = ("id", "name", "title", "metadata_created")
        if any(not isinstance(row.get(key), str) for key in required):
            raise UsSourceParseError(
                source,
                "A catalogue entry arrived without its id, name, title, or creation time",
            )
        created = _parse_ckan_timestamp(
            source, str(row["metadata_created"]), "metadata_created"
        )
        modified_raw = row.get("metadata_modified")
        modified = (
            created
            if modified_raw is None
            else _parse_ckan_timestamp(source, str(modified_raw), "metadata_modified")
        )
        entries.append(
            {
                "id": row["id"],
                "name": row["name"],
                "title": row["title"],
                "assetType": row.get("type", ""),
                "category": _ckan_category(source, row),
                "createdAtEpochSeconds": created,
                "viewLastModifiedEpochSeconds": modified,
                "resourceCount": _ckan_resource_count(source, row),
                "licenceUrl": _ckan_licence(row),
                "attribution": _ckan_attribution(row),
            }
        )

    return {
        "entries": entries,
        "entryCount": len(entries),
        "catalogueCount": count,
        "datasetCount": sum(1 for entry in entries if entry["assetType"] == "dataset"),
        "newestEntry": max(entries, key=lambda entry: entry["createdAtEpochSeconds"]),
        "categories": _categories(entries),
    }


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

FCC_SOCRATA_CATALOGUE_API_BASE = "https://opendata.fcc.gov/api/views.json"
NY_STATE_OPEN_DATA_API_BASE = "https://data.ny.gov/api/views.json"
CHICAGO_OPEN_DATA_API_BASE = "https://data.cityofchicago.org/api/views.json"
SEATTLE_OPEN_DATA_API_BASE = "https://data.seattle.gov/api/views.json"
TEXAS_OPEN_DATA_API_BASE = "https://data.texas.gov/api/views.json"
COLORADO_OPEN_DATA_API_BASE = "https://data.colorado.gov/api/views.json"
WASHINGTON_STATE_OPEN_DATA_API_BASE = "https://data.wa.gov/api/views.json"
MICHIGAN_OPEN_DATA_API_BASE = "https://data.michigan.gov/api/views.json"
OREGON_OPEN_DATA_API_BASE = "https://data.oregon.gov/api/views.json"
PENNSYLVANIA_OPEN_DATA_API_BASE = "https://data.pa.gov/api/views.json"
ILLINOIS_OPEN_DATA_API_BASE = "https://data.illinois.gov/api/views.json"
NEW_JERSEY_OPEN_DATA_API_BASE = "https://data.nj.gov/api/views.json"
VERMONT_OPEN_DATA_API_BASE = "https://data.vermont.gov/api/views.json"
LOS_ANGELES_OPEN_DATA_API_BASE = "https://data.lacity.org/api/views.json"
SAN_FRANCISCO_OPEN_DATA_API_BASE = "https://data.sf.gov/api/views.json"
CALIFORNIA_OPEN_DATA_API_BASE = "https://data.ca.gov/api/3/action/package_search"

fcc_socrata_catalogue_adapter = _catalogue_adapter(
    "fcc-socrata-catalogue",
    "FCC Open Data catalogue",
    "The Federal Communications Commission Socrata catalogue, one row per published dataset, chart, or story, with its category, view count, and download count.",
    f"{FCC_SOCRATA_CATALOGUE_API_BASE}?limit=10",
    "fcc-socrata-catalogue-2026-11-08.json",
)

ny_state_open_data_catalogue_adapter = _catalogue_adapter(
    "ny-state-open-data-catalogue",
    "New York State Open Data catalogue",
    "The New York State Open Data catalogue on Socrata, one row per published dataset or file, with its state topic, view count, and download count.",
    f"{NY_STATE_OPEN_DATA_API_BASE}?limit=10",
    "ny-state-open-data-catalogue-2026-11-08.json",
)

chicago_open_data_catalogue_adapter = _catalogue_adapter(
    "chicago-open-data-catalogue",
    "Chicago Data Portal catalogue",
    "The Chicago Data Portal Socrata catalogue, one row per published dataset, chart, map, or story, with its city topic, view count, and download count.",
    f"{CHICAGO_OPEN_DATA_API_BASE}?limit=10",
    "chicago-open-data-catalogue-2026-11-08.json",
)

seattle_open_data_catalogue_adapter = _catalogue_adapter(
    "seattle-open-data-catalogue",
    "Seattle Open Data catalogue",
    "The Seattle Open Data Socrata catalogue, one row per published dataset, map, chart, or story, with its city topic, view count, and download count.",
    f"{SEATTLE_OPEN_DATA_API_BASE}?limit=10",
    "seattle-open-data-catalogue-2026-11-08.json",
)

texas_open_data_catalogue_adapter = _catalogue_adapter(
    "texas-open-data-catalogue",
    "Texas Open Data catalogue",
    "The Texas Open Data Socrata catalogue, one row per published dataset, map, chart, or linked resource, with its state topic, view count, and download count.",
    f"{TEXAS_OPEN_DATA_API_BASE}?limit=10",
    "texas-open-data-catalogue-2026-11-08.json",
)

colorado_open_data_catalogue_adapter = _catalogue_adapter(
    "colorado-open-data-catalogue",
    "Colorado Open Data catalogue",
    "The Colorado Open Data Socrata catalogue, one row per published dataset, map, chart, or linked resource, with its state topic, view count, and download count.",
    f"{COLORADO_OPEN_DATA_API_BASE}?limit=10",
    "colorado-open-data-catalogue-2026-11-08.json",
)

washington_state_open_data_catalogue_adapter = _catalogue_adapter(
    "washington-state-open-data-catalogue",
    "Washington State Open Data catalogue",
    "The Washington State Open Data Socrata catalogue, one row per published dataset, chart, story, or other resource, with its state topic, view count, and download count.",
    f"{WASHINGTON_STATE_OPEN_DATA_API_BASE}?limit=10",
    "washington-state-open-data-catalogue-2026-11-08.json",
)

michigan_open_data_catalogue_adapter = _catalogue_adapter(
    "michigan-open-data-catalogue",
    "Michigan Open Data catalogue",
    "The Michigan Open Data Socrata catalogue, one row per published dataset, map, chart, story, or other resource, with its state topic, view count, and download count.",
    f"{MICHIGAN_OPEN_DATA_API_BASE}?limit=10",
    "michigan-open-data-catalogue-2026-11-08.json",
)

oregon_open_data_catalogue_adapter = _catalogue_adapter(
    "oregon-open-data-catalogue",
    "Oregon Open Data catalogue",
    "The Oregon Open Data Socrata catalogue, one row per published dataset, file, or filtered view, with its state topic, view count, and download count.",
    f"{OREGON_OPEN_DATA_API_BASE}?limit=10",
    "oregon-open-data-catalogue-2026-11-08.json",
)

pennsylvania_open_data_catalogue_adapter = _catalogue_adapter(
    "pennsylvania-open-data-catalogue",
    "Pennsylvania Open Data catalogue",
    "The Pennsylvania Open Data Socrata catalogue, one row per published dataset, chart, or linked resource, with its state topic, view count, and download count.",
    f"{PENNSYLVANIA_OPEN_DATA_API_BASE}?limit=10",
    "pennsylvania-open-data-catalogue-2026-11-08.json",
)

illinois_open_data_catalogue_adapter = _catalogue_adapter(
    "illinois-open-data-catalogue",
    "Illinois Open Data catalogue",
    "The Illinois Open Data Socrata catalogue, one row per published dataset, chart, story, or filtered view, with its state topic, view count, and download count.",
    f"{ILLINOIS_OPEN_DATA_API_BASE}?limit=10",
    "illinois-open-data-catalogue-2026-11-08.json",
)

new_jersey_open_data_catalogue_adapter = _catalogue_adapter(
    "new-jersey-open-data-catalogue",
    "New Jersey Open Data catalogue",
    "The New Jersey Open Data Socrata catalogue, one row per published dataset, file, story, or other resource, with its state topic, view count, and download count.",
    f"{NEW_JERSEY_OPEN_DATA_API_BASE}?limit=10",
    "new-jersey-open-data-catalogue-2026-11-08.json",
)

vermont_open_data_catalogue_adapter = _catalogue_adapter(
    "vermont-open-data-catalogue",
    "Vermont Open Data catalogue",
    "The Vermont Open Data Socrata catalogue, one row per published dataset or filtered view, with its state topic, view count, and download count.",
    f"{VERMONT_OPEN_DATA_API_BASE}?limit=10",
    "vermont-open-data-catalogue-2026-11-08.json",
)

los_angeles_open_data_catalogue_adapter = _catalogue_adapter(
    "los-angeles-open-data-catalogue",
    "Los Angeles Open Data catalogue",
    "The Los Angeles Open Data Socrata catalogue, one row per published dataset, map, or filtered view, with its city topic, view count, and download count.",
    f"{LOS_ANGELES_OPEN_DATA_API_BASE}?limit=10",
    "los-angeles-open-data-catalogue-2026-11-08.json",
)

san_francisco_open_data_catalogue_adapter = _catalogue_adapter(
    "san-francisco-open-data-catalogue",
    "San Francisco Open Data catalogue",
    "The San Francisco Open Data Socrata catalogue, one row per published dataset, map, or filtered view, with its city topic, view count, and download count.",
    f"{SAN_FRANCISCO_OPEN_DATA_API_BASE}?limit=10",
    "san-francisco-open-data-catalogue-2026-11-08.json",
)


def _fetch_california_open_data_catalogue(
    options: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Reads one page of the California CKAN package search."""
    return parse_california_open_data_catalogue_payload(
        get_json(f"{CALIFORNIA_OPEN_DATA_API_BASE}?rows=10")
    )


california_open_data_catalogue_adapter = UsDataAdapter(
    id="california-open-data-catalogue",
    name="California Open Data catalogue",
    auth="none",
    description="The California Open Data CKAN catalogue, one row per published dataset package, with its title, groups, resources, licence, and publishing organisation.",
    fetch_live=_fetch_california_open_data_catalogue,
    parse=parse_california_open_data_catalogue_payload,
    load_fixture=lambda: parse_california_open_data_catalogue_payload(
        read_fixture_json("california-open-data-catalogue-2026-11-08.json")
    ),
)
