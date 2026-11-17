"""NHTSA vehicle model adapter."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlencode

from .common import UsDataAdapter, as_int, require_dict, require_list
from .errors import UsSourceApiError, UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json

NHTSA_VEHICLE_MODELS_API_BASE = "https://api.nhtsa.gov/vehicles/models"
NHTSA_DEFAULT_MODEL_YEAR = 2025
NHTSA_DEFAULT_MAKE = "Honda"
NHTSA_MODEL_PAGE_SIZE = 100
NHTSA_MIN_MODEL_YEAR = 1900
NHTSA_MAX_MODEL_YEAR = 2100


def _nhtsa_int(value: Any, source: str, field: str) -> int:
    """Reads a required whole number or raises a parse error."""
    number = as_int(value)
    if number is None:
        raise UsSourceParseError(source, f"A model page carried an unreadable {field}")
    return number


def build_nhtsa_vehicle_models_url(
    query: Mapping[str, Any] | None = None,
) -> str:
    """Builds the request URL for one page of vehicle models."""
    options = query or {}
    model_year = options.get("modelYear", NHTSA_DEFAULT_MODEL_YEAR)
    if (
        not isinstance(model_year, int)
        or isinstance(model_year, bool)
        or model_year < NHTSA_MIN_MODEL_YEAR
        or model_year > NHTSA_MAX_MODEL_YEAR
    ):
        raise UsSourceApiError(
            "nhtsa-vehicle-models",
            f"modelYear must be a whole number from {NHTSA_MIN_MODEL_YEAR} to {NHTSA_MAX_MODEL_YEAR}.",
        )
    make = options.get("make", NHTSA_DEFAULT_MAKE)
    if not isinstance(make, str) or make.strip() == "":
        raise UsSourceApiError(
            "nhtsa-vehicle-models", "make must not be blank."
        )
    maximum = options.get("max", NHTSA_MODEL_PAGE_SIZE)
    if (
        not isinstance(maximum, int)
        or isinstance(maximum, bool)
        or maximum < 1
    ):
        raise UsSourceApiError(
            "nhtsa-vehicle-models", "max must be a whole number of at least 1."
        )
    offset = options.get("offset", 0)
    if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
        raise UsSourceApiError(
            "nhtsa-vehicle-models", "offset must be a whole number of at least 0."
        )
    params = urlencode(
        {
            "modelYear": str(model_year),
            "make": make.strip(),
            "max": str(maximum),
            "offset": str(offset),
        }
    )
    return f"{NHTSA_VEHICLE_MODELS_API_BASE}?{params}"


def _nhtsa_non_negative_int(value: Any, source: str, field: str) -> int:
    """Reads a whole number of at least zero from the pagination block."""
    number = _nhtsa_int(value, source, field)
    if number < 0:
        raise UsSourceParseError(source, f"A model page carried an invalid {field}")
    return number


def parse_nhtsa_vehicle_models_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of NHTSA vehicle models."""
    source = "nhtsa-vehicle-models"
    parsed = require_dict(payload, source)
    meta = parsed.get("meta")
    if not isinstance(meta, dict):
        raise UsSourceParseError(source, "The response carried no service metadata")
    status = meta.get("status")
    if not isinstance(status, int) or isinstance(status, bool):
        raise UsSourceParseError(source, "The response carried no service status")
    if status != 200:
        raise UsSourceApiError(source, f"NHTSA reported status {status}")
    pagination = meta.get("pagination")
    if not isinstance(pagination, dict):
        raise UsSourceParseError(source, "The response carried no pagination block")
    rows = require_list(parsed.get("results"), source)
    models: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise UsSourceParseError(source, "A vehicle model is not an object")
        model_year = _nhtsa_int(row.get("modelYear"), source, "model year")
        make = row.get("make")
        vehicle_model = row.get("vehicleModel")
        if not isinstance(make, str) or make == "":
            raise UsSourceParseError(source, "A vehicle model arrived without its make")
        if not isinstance(vehicle_model, str) or vehicle_model == "":
            raise UsSourceParseError(source, "A vehicle model arrived without its model name")
        models.append(
            {
                "modelYear": model_year,
                "make": make,
                "vehicleModel": vehicle_model,
            }
        )
    next_url = pagination.get("nextUrl")
    if next_url is not None and not isinstance(next_url, str):
        raise UsSourceParseError(source, "The response carried an unreadable next-page URL")
    return {
        "models": models,
        "modelCount": len(models),
        "totalCount": _nhtsa_non_negative_int(
            pagination.get("total"), source, "model total"
        ),
        "offset": _nhtsa_non_negative_int(
            pagination.get("offset"), source, "offset"
        ),
        "max": _nhtsa_non_negative_int(pagination.get("max"), source, "page size"),
        "nextUrl": next_url,
    }


def _fetch_nhtsa_vehicle_models(
    options: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Reads one page of NHTSA vehicle models."""
    return parse_nhtsa_vehicle_models_payload(
        get_json(build_nhtsa_vehicle_models_url(options))
    )


nhtsa_vehicle_models_adapter = UsDataAdapter(
    id="nhtsa-vehicle-models",
    name="NHTSA vehicle models",
    auth="none",
    description="Vehicle models NHTSA lists for one model year and make, one row per model, with the service total and next-page URL.",
    fetch_live=_fetch_nhtsa_vehicle_models,
    parse=parse_nhtsa_vehicle_models_payload,
    load_fixture=lambda: parse_nhtsa_vehicle_models_payload(
        read_fixture_json("nhtsa-vehicle-models-2025-honda-2026-11-08.json")
    ),
)
