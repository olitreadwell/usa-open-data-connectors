"""Offline tests for every adapter in the US Python port."""

from __future__ import annotations

from typing import Any

import pytest

from usadata import US_DATA_SOURCES, get_us_data_source
from usadata.errors import UsSourceParseError

EXPECTED_IDS = [
    "bls-unemployment-rate",
    "usgs-hawaii-earthquakes",
    "cdc-county-obesity",
    "ncei-annual-temperature",
    "noaa-sea-level",
    "treasury-avg-interest-rate",
    "fema-disaster-declarations",
    "openfda-food-recalls",
    "usgs-peak-streamflow",
    "cpsc-product-recalls",
    "cfpb-consumer-complaints",
    "treasury-debt-to-penny",
    "sec-edgar-filings",
    "fdic-bank-directory",
    "clinicaltrials-studies",
    "nws-point-forecast",
    "usaspending-agencies",
    "epa-envirofacts-facilities",
    "ncbi-pubmed-search",
    "cdc-socrata-catalogue",
    "healthdata-socrata-catalogue",
    "nyc-open-data-catalogue",
    "bts-transportation-stats",
    "estimatetax-income-tax",
    "callook-callsigns",
    "college-scorecard-institutions",
    "publicdatahub-hospital-quality",
    "nextbus-transit-vehicles",
]

EXPECTED_FIXTURE_VALUES = {
    "bls-unemployment-rate": ("points", 247),
    "usgs-hawaii-earthquakes": ("count", 264),
    "cdc-county-obesity": ("countyCount", 2956),
    "ncei-annual-temperature": ("yearCount", 131),
    "noaa-sea-level": ("yearCount", 155),
    "treasury-avg-interest-rate": ("monthCount", 308),
    "fema-disaster-declarations": ("declarationCount", 5272),
    "openfda-food-recalls": ("recallCount", 29463),
    "usgs-peak-streamflow": ("yearCount", 165),
    "cpsc-product-recalls": ("totalRecalls", 3986),
    "cfpb-consumer-complaints": ("totalComplaints", 18145013),
    "treasury-debt-to-penny": ("dayCount", 10),
    "sec-edgar-filings": ("filingCount", 1001),
    "fdic-bank-directory": ("bankCount", 10),
    "clinicaltrials-studies": ("studyCount", 10),
    "nws-point-forecast": ("gridId", "LWX"),
    "usaspending-agencies": ("agencyCount", 111),
    "epa-envirofacts-facilities": ("facilityCount", 10),
    "ncbi-pubmed-search": ("returnedCount", 10),
    "cdc-socrata-catalogue": ("entryCount", 10),
    "healthdata-socrata-catalogue": ("entryCount", 10),
    "nyc-open-data-catalogue": ("entryCount", 50),
    "bts-transportation-stats": ("entryCount", 10),
    "estimatetax-income-tax": ("taxYear", 2026),
    "callook-callsigns": ("callsignCount", 10),
    "college-scorecard-institutions": ("institutionCount", 6),
    "publicdatahub-hospital-quality": ("measureCount", 7),
    "nextbus-transit-vehicles": ("vehicleCount", 5),
}


def test_registry_matches_typescript_adapter_ids() -> None:
    assert [source.id for source in US_DATA_SOURCES] == EXPECTED_IDS


def test_registry_lookup_and_metadata() -> None:
    assert get_us_data_source("bls-unemployment-rate") is not None
    assert get_us_data_source("does-not-exist") is None
    for source in US_DATA_SOURCES:
        assert source.name
        assert source.auth == "none"
        assert source.description


@pytest.mark.parametrize("source", US_DATA_SOURCES, ids=lambda source: source.id)
def test_every_adapter_has_a_parser_fixture_and_fetcher(source: Any) -> None:
    assert callable(source.parse)
    assert callable(source.fetch_live)
    with pytest.raises(UsSourceParseError):
        source.parse(None)


@pytest.mark.parametrize("source", US_DATA_SOURCES, ids=lambda source: source.id)
def test_every_adapter_parses_its_committed_fixture(source: Any) -> None:
    parsed = source.load_fixture()
    assert isinstance(parsed, dict)
    key, expected = EXPECTED_FIXTURE_VALUES[source.id]
    actual = parsed[key]
    assert (len(actual) if isinstance(actual, list) else actual) == expected
