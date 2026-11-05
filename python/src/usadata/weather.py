"""Weather, climate, and transit vehicle adapters."""

from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlencode

from .common import (
    UsDataAdapter,
    as_int,
    as_number,
    normalize_number,
    require_dict,
    require_list,
    sequential_sum,
)
from .errors import UsSourceApiError, UsSourceParseError
from .fetchers import json_fetcher, text_fetcher
from .fixtures import read_fixture_json, read_fixture_text
from .http import get_text

NOAA_COOPS_API_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
NCEI_CLIMATE_AT_A_GLANCE_BASE = (
    "https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance"
)
NWS_API_BASE = "https://api.weather.gov"
NEXTBUS_XML_FEED_BASE = "https://retro.umoiq.com/service/publicXMLFeed"


def parse_ncei_annual_temperature_csv(csv: str) -> list[dict[str, Any]]:
    """Parses the Climate at a Glance annual temperature CSV."""
    years: list[dict[str, Any]] = []
    seen = set()
    for line in csv.splitlines():
        row = line.strip()
        if row == "" or row.startswith("#") or row == "Date,Value":
            continue
        match = re.fullmatch(r"(\d{4})(\d{2}),(-?\d+(?:\.\d+)?)", row)
        if match is None or match.group(2) != "12":
            raise UsSourceParseError(
                "ncei", f"Unreadable row in the temperature file: {row}"
            )
        year = int(match.group(1))
        if year in seen:
            raise UsSourceParseError("ncei", f"Two rows for {year}")
        seen.add(year)
        years.append({"year": year, "valueFahrenheit": float(match.group(3))})
    if not years:
        raise UsSourceParseError("ncei", "No annual rows in the response")
    return sorted(years, key=lambda row: row["year"])


def build_ncei_annual_temperature_series(payload: Any) -> dict[str, Any]:
    """Builds the annual temperature series and its extremes."""
    if not isinstance(payload, str):
        raise UsSourceParseError(
            "ncei", "The temperature download is CSV text, not JSON"
        )
    years = parse_ncei_annual_temperature_csv(payload)
    return {
        "years": years,
        "yearCount": len(years),
        "firstYear": years[0]["year"],
        "lastYear": years[-1]["year"],
        "warmest": max(years, key=lambda row: row["valueFahrenheit"]),
        "coldest": min(years, key=lambda row: row["valueFahrenheit"]),
        "meanFahrenheit": sequential_sum(row["valueFahrenheit"] for row in years)
        / len(years),
    }


def parse_noaa_sea_level_payload(payload: Any) -> dict[str, Any]:
    """Parses NOAA CO-OPS monthly sea-level rows."""
    parsed = require_dict(payload, "noaa")
    if isinstance(parsed.get("error"), dict):
        raise UsSourceApiError("noaa", str(parsed["error"].get("message", "rejected")))
    metadata = parsed.get("metadata")
    if not isinstance(metadata, dict) or "id" not in metadata or "name" not in metadata:
        raise UsSourceParseError("noaa", "The response carried no station metadata")
    months: list[dict[str, Any]] = []
    for row in require_list(parsed.get("data"), "noaa"):
        if not isinstance(row, dict):
            continue
        year = as_int(row.get("year"))
        month = as_int(row.get("month"))
        if year is None or month is None:
            raise UsSourceParseError("noaa", "A monthly row has no year or month")
        if row.get("MSL") is None or str(row.get("MSL", "")).strip() == "":
            continue
        value = as_number(row.get("MSL"))
        if value is None:
            raise UsSourceParseError(
                "noaa", f"Unreadable mean sea level: {row.get('MSL')}"
            )
        months.append({"year": year, "month": month, "meanSeaLevelMeters": value})
    if not months:
        raise UsSourceParseError("noaa", "No monthly values in the response")
    return {
        "station": {"id": str(metadata["id"]), "name": str(metadata["name"])},
        "months": months,
    }


def build_noaa_sea_level_series(payload: Any) -> dict[str, Any]:
    """Builds annual NOAA sea-level means and a fitted trend."""
    parsed = parse_noaa_sea_level_payload(payload)
    by_year: dict[int, list[float]] = {}
    for month in parsed["months"]:
        by_year.setdefault(month["year"], []).append(month["meanSeaLevelMeters"])
    years = [
        {
            "year": year,
            "meanSeaLevelMeters": sequential_sum(values) / len(values),
            "monthCount": len(values),
        }
        for year, values in sorted(by_year.items())
    ]
    count = len(years)
    sum_years = sequential_sum(row["year"] for row in years)
    sum_levels = sequential_sum(row["meanSeaLevelMeters"] for row in years)
    sum_products = sequential_sum(
        row["year"] * row["meanSeaLevelMeters"] for row in years
    )
    sum_squares = sequential_sum(row["year"] * row["year"] for row in years)
    denominator = count * sum_squares - sum_years * sum_years
    if denominator == 0:
        raise UsSourceParseError("noaa", "Every year in the window is the same year")
    trend = (count * sum_products - sum_years * sum_levels) / denominator * 1000
    return {
        "station": parsed["station"],
        "years": years,
        "yearCount": count,
        "firstYear": years[0],
        "lastYear": years[-1],
        "highest": max(years, key=lambda row: row["meanSeaLevelMeters"]),
        "lowest": min(years, key=lambda row: row["meanSeaLevelMeters"]),
        "trendMillimetresPerYear": trend,
        "changeFirstToLastMeters": years[-1]["meanSeaLevelMeters"]
        - years[0]["meanSeaLevelMeters"],
    }


def parse_nws_point_forecast_payload(payload: Any) -> dict[str, Any]:
    """Parses the NWS point forecast grid metadata."""
    parsed = require_dict(payload, "nws")
    if parsed.get("type") != "Feature":
        raise UsSourceParseError("nws", "The response is not a GeoJSON feature")
    geometry = parsed.get("geometry")
    properties = parsed.get("properties")
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        raise UsSourceParseError("nws", "The response carried no coordinate pair")
    if not isinstance(properties, dict) or any(
        properties.get(key) is None
        for key in ("gridId", "gridX", "gridY", "forecast", "forecastOffice")
    ):
        raise UsSourceParseError(
            "nws", "The response carried no forecast grid for the point"
        )
    relative = properties.get("relativeLocation")
    relative_properties = (
        relative.get("properties") if isinstance(relative, dict) else {}
    )
    if not isinstance(relative_properties, dict):
        relative_properties = {}
    return {
        "latitude": coordinates[1],
        "longitude": coordinates[0],
        "city": relative_properties.get("city", ""),
        "state": relative_properties.get("state", ""),
        "gridId": properties["gridId"],
        "gridX": properties["gridX"],
        "gridY": properties["gridY"],
        "forecastOfficeUrl": properties["forecastOffice"],
        "forecastUrl": properties["forecast"],
        "forecastHourlyUrl": properties.get("forecastHourly", ""),
        "forecastGridDataUrl": properties.get("forecastGridData", ""),
        "observationStationsUrl": properties.get("observationStations", ""),
        "timeZone": properties.get("timeZone", ""),
        "radarStation": properties.get("radarStation"),
        "countyUrl": properties.get("county", ""),
        "fireWeatherZoneUrl": properties.get("fireWeatherZone", ""),
    }


def parse_nextbus_vehicle_payload(
    payload: Any, agency_tag: str = "portland-sc", route_tag: str = "193"
) -> dict[str, Any]:
    """Parses a NextBus vehicle-location XML body."""
    try:
        root = ET.fromstring(str(payload))
    except ET.ParseError as error:
        raise UsSourceParseError("nextbus", "The response was not valid XML") from error
    if root.tag != "body":
        raise UsSourceParseError("nextbus", "The response carried no body")
    error_element = root.find("Error")
    if error_element is not None:
        raise UsSourceParseError(
            "nextbus", error_element.text or "The feed rejected the request"
        )
    last_time = root.find("lastTime")
    if last_time is None or last_time.get("time") is None:
        raise UsSourceParseError("nextbus", "The response carried no timestamp")
    vehicles: list[dict[str, Any]] = []
    for vehicle in root.findall("vehicle"):
        predictable = vehicle.get("predictable") == "true"
        vehicles.append(
            {
                "vehicleId": vehicle.get("id", ""),
                "routeTag": vehicle.get("routeTag", ""),
                "directionTag": vehicle.get("dirTag", ""),
                "latitude": float(vehicle.get("lat", "0")),
                "longitude": float(vehicle.get("lon", "0")),
                "headingDegrees": as_int(vehicle.get("heading"))
                if vehicle.get("heading") is not None
                else None,
                "speedKmPerHour": as_number(vehicle.get("speedKmHr"))
                if vehicle.get("speedKmHr") is not None
                else None,
                "secondsSinceReport": as_int(vehicle.get("secsSinceReport")),
                "predictable": predictable,
            }
        )
    report_ages = [
        row["secondsSinceReport"]
        for row in vehicles
        if row["secondsSinceReport"] is not None
    ]
    speeds = [
        row["speedKmPerHour"] for row in vehicles if row["speedKmPerHour"] is not None
    ]
    return {
        "agencyTag": agency_tag,
        "routeTag": route_tag,
        "observedAtEpochMs": int(last_time.get("time", "0")),
        "vehicles": vehicles,
        "vehicleCount": len(vehicles),
        "predictableVehicleCount": sum(1 for row in vehicles if row["predictable"]),
        "averageSpeedKmPerHour": normalize_number(round(sum(speeds) / len(speeds), 1))
        if speeds
        else 0,
        "newestReportSeconds": min(report_ages) if report_ages else None,
        "oldestReportSeconds": max(report_ages) if report_ages else None,
    }


def _ncei_url() -> str:
    year = dt.datetime.now(tz=dt.timezone.utc).year
    return f"{NCEI_CLIMATE_AT_A_GLANCE_BASE}/national/time-series/110/avg-temp/12/12/1895-{year}.csv"


def _noaa_url() -> str:
    query = urlencode(
        {
            "product": "monthly_mean",
            "application": "usa-open-data-connectors",
            "begin_date": "18560101",
            "end_date": f"{dt.datetime.now(tz=dt.timezone.utc).year}1231",
            "datum": "MSL",
            "station": "8518750",
            "time_zone": "gmt",
            "units": "metric",
            "format": "json",
        }
    )
    return f"{NOAA_COOPS_API_BASE}?{query}"


def _nextbus_url() -> str:
    return f"{NEXTBUS_XML_FEED_BASE}?command=vehicleLocations&a=portland-sc&r=193&t=0"


ncei_annual_temperature_adapter = UsDataAdapter(
    id="ncei-annual-temperature",
    name="NOAA NCEI contiguous US annual temperature",
    auth="none",
    description="Calendar-year average temperature for the contiguous United States since 1895, from the NOAA National Centers for Environmental Information.",
    fetch_live=text_fetcher(_ncei_url(), build_ncei_annual_temperature_series),
    parse=build_ncei_annual_temperature_series,
    load_fixture=lambda: build_ncei_annual_temperature_series(
        read_fixture_text("ncei-annual-temperature-2026-09-26.csv")
    ),
)

noaa_sea_level_adapter = UsDataAdapter(
    id="noaa-sea-level",
    name="NOAA CO-OPS sea level",
    auth="none",
    description="Monthly mean sea level at a NOAA tide gauge, folded into calendar-year averages with a fitted trend.",
    fetch_live=json_fetcher(_noaa_url(), build_noaa_sea_level_series),
    parse=build_noaa_sea_level_series,
    load_fixture=lambda: build_noaa_sea_level_series(
        read_fixture_json("noaa-sea-level-2026-09-27.json")
    ),
)

nws_point_forecast_adapter = UsDataAdapter(
    id="nws-point-forecast",
    name="NWS point forecast",
    auth="none",
    description="The National Weather Service forecast grid point for a latitude and longitude, with the URLs that lead to the daily and hourly forecast.",
    fetch_live=json_fetcher(
        f"{NWS_API_BASE}/points/38.8894,-77.0352", parse_nws_point_forecast_payload
    ),
    parse=parse_nws_point_forecast_payload,
    load_fixture=lambda: parse_nws_point_forecast_payload(
        read_fixture_json("nws-point-forecast-2026-10-05.json")
    ),
)


def _fetch_nextbus(options: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return parse_nextbus_vehicle_payload(get_text(_nextbus_url()))


nextbus_transit_vehicles_adapter = UsDataAdapter(
    id="nextbus-transit-vehicles",
    name="NextBus transit vehicles",
    auth="none",
    description="Live vehicle positions on the Portland Streetcar NS line, one of the agencies on the keyless NextBus XML feed, with latitude, longitude, heading, speed, and report age.",
    fetch_live=_fetch_nextbus,
    parse=parse_nextbus_vehicle_payload,
    load_fixture=lambda: parse_nextbus_vehicle_payload(
        read_fixture_text("nextbus-portland-streetcar-vehicles-2026-10-22.xml")
    ),
)
