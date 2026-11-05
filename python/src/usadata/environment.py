"""Environment and physical-science adapters."""

from __future__ import annotations

import datetime as dt
import re
from typing import Any
from urllib.parse import urlencode

from .common import (
    UsDataAdapter,
    as_int,
    as_number,
    require_dict,
    require_list,
)
from .errors import UsSourceApiError, UsSourceParseError
from .fetchers import json_fetcher
from .fixtures import read_fixture_json

BLS_API_BASE = "https://api.bls.gov/publicAPI/v2/timeseries/data"
US_UNEMPLOYMENT_SERIES_ID = "LNS14000000"
USGS_EARTHQUAKE_API_BASE = "https://earthquake.usgs.gov/fdsnws/event/1/query"
USGS_WATER_DATA_API_BASE = "https://api.waterdata.usgs.gov/ogcapi/v0"
USGS_PEAK_STREAMFLOW_COLLECTION = "peaks"
USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID = "USGS-07010000"
CDC_PLACES_COUNTY_API_BASE = "https://data.cdc.gov/resource/swc5-untb.json"


def parse_bls_observations(payload: Any) -> list[dict[str, Any]]:
    """Parses BLS monthly observations, dropping annual averages."""
    parsed = require_dict(payload, "bls")
    results = parsed.get("Results")
    if not isinstance(results, dict) or not isinstance(results.get("series"), list):
        raise UsSourceParseError("bls", "invalid BLS response")
    if parsed.get("status") != "REQUEST_SUCCEEDED":
        raise UsSourceApiError("bls", str(parsed.get("status")))
    observations: list[dict[str, Any]] = []
    for series in results["series"]:
        if not isinstance(series, dict) or not isinstance(series.get("data"), list):
            continue
        series_id = str(series.get("seriesID", ""))
        for row in series["data"]:
            if not isinstance(row, dict):
                continue
            period = str(row.get("period", ""))
            year = as_int(row.get("year"))
            value = as_number(row.get("value"))
            if (
                re.fullmatch(r"M(0[1-9]|1[0-2])", period) is None
                or year is None
                or value is None
            ):
                continue
            observations.append(
                {
                    "seriesId": series_id,
                    "year": year,
                    "period": period,
                    "periodName": str(row.get("periodName", "")),
                    "value": value,
                }
            )
    return sorted(observations, key=lambda row: (row["year"], row["period"]))


def build_bls_series(payload: Any) -> dict[str, Any]:
    """Builds the national unemployment series and its headline points."""
    points = [
        row
        for row in parse_bls_observations(payload)
        if row["seriesId"] == US_UNEMPLOYMENT_SERIES_ID
    ]
    if not points:
        raise UsSourceParseError(
            "bls", f"No observations for series {US_UNEMPLOYMENT_SERIES_ID}"
        )
    first, latest = points[0], points[-1]
    peak = max(points, key=lambda row: row["value"])
    lowest = min(points, key=lambda row: row["value"])
    return {
        "seriesId": US_UNEMPLOYMENT_SERIES_ID,
        "points": points,
        "first": first,
        "latest": latest,
        "peak": peak,
        "lowest": lowest,
        "changeFromPeak": latest["value"] - peak["value"],
        "changeFromFirst": latest["value"] - first["value"],
    }


def parse_usgs_earthquakes(payload: Any) -> list[dict[str, Any]]:
    """Parses USGS earthquake features, dropping non-earthquake events."""
    parsed = require_dict(payload, "usgs")
    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict) or metadata.get("status") != 200:
        raise UsSourceApiError(
            "usgs",
            f"catalogue status {metadata.get('status') if isinstance(metadata, dict) else 'missing'}",
        )
    features = require_list(parsed.get("features"), "usgs")
    earthquakes: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        coordinates = geometry.get("coordinates")
        if properties.get("type") != "earthquake" or not isinstance(coordinates, list):
            continue
        magnitude = as_number(properties.get("mag"))
        time_ms = as_number(properties.get("time"))
        depth = as_number(coordinates[2]) if len(coordinates) > 2 else None
        place = properties.get("place")
        if magnitude is None or time_ms is None or depth is None or place is None:
            continue
        earthquakes.append(
            {
                "id": str(feature.get("id", "")),
                "magnitude": magnitude,
                "place": place,
                "timeMs": int(time_ms),
                "depthKm": depth,
                "url": str(properties.get("url", "")),
            }
        )
    return sorted(earthquakes, key=lambda row: (row["timeMs"], row["id"]))


def build_usgs_earthquake_catalogue(payload: Any) -> dict[str, Any]:
    """Builds the Hawaii earthquake catalogue and its extremes."""
    earthquakes = parse_usgs_earthquakes(payload)
    if not earthquakes:
        raise UsSourceParseError("usgs", "No earthquakes in the catalogue")
    return {
        "earthquakes": earthquakes,
        "count": len(earthquakes),
        "strongest": max(earthquakes, key=lambda row: row["magnitude"]),
        "deepest": max(earthquakes, key=lambda row: row["depthKm"]),
        "earliest": earthquakes[0],
        "latest": earthquakes[-1],
    }


def parse_cdc_county_obesity_payload(payload: Any) -> dict[str, Any]:
    """Parses CDC PLACES county obesity rows."""
    rows = require_list(payload, "cdc")
    counties: list[dict[str, Any]] = []
    national: dict[str, Any] | None = None
    data_year: int | None = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        percent = as_number(row.get("data_value"))
        population = as_number(row.get("totalpopulation"))
        year = as_int(row.get("year"))
        if year is not None:
            data_year = year if data_year is None else max(data_year, year)
        if percent is None or population is None:
            continue
        if row.get("stateabbr") == "US":
            national = {"percent": percent, "population": population}
            continue
        if row.get("locationname") is None or row.get("stateabbr") is None:
            continue
        counties.append(
            {
                "countyName": row["locationname"],
                "stateAbbr": row["stateabbr"],
                "percent": percent,
                "population": population,
            }
        )
    counties.sort(key=lambda row: (row["percent"], row["stateAbbr"], row["countyName"]))
    return {"counties": counties, "national": national, "dataYear": data_year}


def build_cdc_county_obesity_set(payload: Any) -> dict[str, Any]:
    """Builds the county obesity set and its extremes."""
    parsed = parse_cdc_county_obesity_payload(payload)
    counties = parsed["counties"]
    if not counties:
        raise UsSourceParseError("cdc", "No county estimates in the response")
    if parsed["national"] is None:
        raise UsSourceParseError("cdc", "The response carried no national row")
    if parsed["dataYear"] is None:
        raise UsSourceParseError("cdc", "The response carried no survey year")
    return {
        "counties": counties,
        "countyCount": len(counties),
        "lowest": counties[0],
        "highest": counties[-1],
        "national": parsed["national"],
        "dataYear": parsed["dataYear"],
    }


def parse_usgs_peak_streamflow_payload(payload: Any) -> list[dict[str, Any]]:
    """Parses USGS annual peak-flow feature rows."""
    parsed = require_dict(payload, "usgs-peak-streamflow")
    features = parsed.get("features")
    if not isinstance(features, list) or not features:
        raise UsSourceParseError("usgs-peak-streamflow", "The response carried no rows")
    years: list[dict[str, Any]] = []
    for feature in features:
        properties = feature.get("properties") if isinstance(feature, dict) else None
        if not isinstance(properties, dict):
            continue
        location = properties.get("monitoring_location_id")
        if location is not None and location != USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID:
            raise UsSourceParseError(
                "usgs-peak-streamflow", f"Unexpected gauge in the response: {location}"
            )
        parameter = properties.get("parameter_code")
        if parameter is not None and parameter != "00060":
            raise UsSourceParseError(
                "usgs-peak-streamflow",
                f"Unexpected parameter in the response: {parameter}",
            )
        value_text = properties.get("value")
        if value_text is None or str(value_text).strip() == "":
            continue
        value = as_number(value_text)
        peak_date = properties.get("time")
        water_year = properties.get("water_year")
        if (
            value is None
            or not isinstance(peak_date, str)
            or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", peak_date)
        ):
            raise UsSourceParseError(
                "usgs-peak-streamflow", f"Unreadable peak row: {properties}"
            )
        if not isinstance(water_year, int):
            raise UsSourceParseError(
                "usgs-peak-streamflow", f"Row {peak_date} carries no water year"
            )
        years.append(
            {
                "waterYear": water_year,
                "calendarYear": int(peak_date[:4]),
                "peakDate": peak_date,
                "peakDischargeCubicFeetPerSecond": value,
                "qualifiers": properties.get("qualifier") or [],
            }
        )
    if not years:
        raise UsSourceParseError(
            "usgs-peak-streamflow", "No peak values in the response"
        )
    return years


def build_usgs_peak_streamflow_series(payload: Any) -> dict[str, Any]:
    """Builds the peak-flow record with its extremes and gaps."""
    years = sorted(
        parse_usgs_peak_streamflow_payload(payload), key=lambda row: row["waterYear"]
    )
    highest = max(years, key=lambda row: row["peakDischargeCubicFeetPerSecond"])
    lowest = min(years, key=lambda row: row["peakDischargeCubicFeetPerSecond"])
    by_value = sorted(years, key=lambda row: row["peakDischargeCubicFeetPerSecond"])
    filed = {row["waterYear"] for row in years}
    missing = [
        year
        for year in range(years[0]["waterYear"], years[-1]["waterYear"] + 1)
        if year not in filed
    ]
    return {
        "monitoringLocationId": USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
        "years": years,
        "yearCount": len(years),
        "firstYear": years[0],
        "lastYear": years[-1],
        "highest": highest,
        "lowest": lowest,
        "median": by_value[len(by_value) // 2],
        "missingWaterYears": missing,
        "highestToLowestRatio": round(
            highest["peakDischargeCubicFeetPerSecond"]
            / lowest["peakDischargeCubicFeetPerSecond"]
            * 10
        )
        / 10,
    }


def _earthquake_url() -> str:
    end = dt.datetime.now(tz=dt.timezone.utc).date()
    start = end - dt.timedelta(days=365)
    query = urlencode(
        {
            "format": "geojson",
            "starttime": start.isoformat(),
            "endtime": end.isoformat(),
            "minmagnitude": "2.5",
            "minlatitude": "18.5",
            "maxlatitude": "22.5",
            "minlongitude": "-161",
            "maxlongitude": "-154",
        }
    )
    return f"{USGS_EARTHQUAKE_API_BASE}?{query}"


def _peak_url() -> str:
    query = urlencode(
        {
            "monitoring_location_id": USGS_MISSISSIPPI_ST_LOUIS_LOCATION_ID,
            "parameter_code": "00060",
            "limit": "500",
        }
    )
    return f"{USGS_WATER_DATA_API_BASE}/collections/{USGS_PEAK_STREAMFLOW_COLLECTION}/items?{query}"


bls_unemployment_adapter = UsDataAdapter(
    id="bls-unemployment-rate",
    name="US unemployment rate, seasonally adjusted",
    auth="none",
    description="Monthly national unemployment rate from the Current Population Survey.",
    fetch_live=json_fetcher(
        f"{BLS_API_BASE}/{US_UNEMPLOYMENT_SERIES_ID}?startyear=2006&endyear=2026",
        build_bls_series,
    ),
    parse=build_bls_series,
    load_fixture=lambda: build_bls_series(
        read_fixture_json("bls-unemployment-rate.json")
    ),
)

usgs_hawaii_earthquakes_adapter = UsDataAdapter(
    id="usgs-hawaii-earthquakes",
    name="USGS earthquakes around Hawaii",
    auth="none",
    description="Earthquakes of magnitude 2.5 and above near the Hawaiian islands.",
    fetch_live=json_fetcher(_earthquake_url(), build_usgs_earthquake_catalogue),
    parse=build_usgs_earthquake_catalogue,
    load_fixture=lambda: build_usgs_earthquake_catalogue(
        read_fixture_json("usgs-hawaii-earthquakes.json")
    ),
)

cdc_county_obesity_adapter = UsDataAdapter(
    id="cdc-county-obesity",
    name="CDC county adult obesity",
    auth="none",
    description="Model-based share of adults with obesity in each US county, from the CDC PLACES release.",
    fetch_live=json_fetcher(
        f"{CDC_PLACES_COUNTY_API_BASE}?$limit=5000&$select=locationname,stateabbr,data_value,totalpopulation,year",
        build_cdc_county_obesity_set,
    ),
    parse=build_cdc_county_obesity_set,
    load_fixture=lambda: build_cdc_county_obesity_set(
        read_fixture_json("cdc-county-obesity-2026-09-25.json")
    ),
)

usgs_peak_streamflow_adapter = UsDataAdapter(
    id="usgs-peak-streamflow",
    name="USGS annual peak streamflow",
    auth="none",
    description="Annual peak streamflow for the Mississippi River at St. Louis, one row per water year, with the highest, lowest, and middle peaks.",
    fetch_live=json_fetcher(_peak_url(), build_usgs_peak_streamflow_series),
    parse=build_usgs_peak_streamflow_series,
    load_fixture=lambda: build_usgs_peak_streamflow_series(
        read_fixture_json("usgs-peak-streamflow-2026-10-01.json")
    ),
)
