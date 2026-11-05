"""The uniform US adapter registry."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from .catalogues import (
    bts_transportation_stats_adapter,
    cdc_socrata_catalogue_adapter,
    healthdata_socrata_catalogue_adapter,
    nyc_open_data_catalogue_adapter,
)
from .common import UsDataAdapter
from .environment import (
    bls_unemployment_adapter,
    cdc_county_obesity_adapter,
    usgs_hawaii_earthquakes_adapter,
    usgs_peak_streamflow_adapter,
)
from .errors import UsSourceError
from .finance import (
    cfpb_consumer_complaints_adapter,
    cpsc_product_recalls_adapter,
    openfda_food_recalls_adapter,
    treasury_avg_interest_rate_adapter,
    treasury_debt_to_penny_adapter,
)
from .government import (
    fema_disaster_declarations_adapter,
    sec_edgar_filings_adapter,
    usaspending_agencies_adapter,
)
from .health import (
    clinicaltrials_studies_adapter,
    epa_envirofacts_facilities_adapter,
    fdic_bank_directory_adapter,
    ncbi_pubmed_search_adapter,
    publicdatahub_hospital_adapter,
)
from .people import (
    callook_callsigns_adapter,
    college_scorecard_institutions_adapter,
    estimatetax_income_tax_adapter,
)
from .weather import (
    ncei_annual_temperature_adapter,
    nextbus_transit_vehicles_adapter,
    noaa_sea_level_adapter,
    nws_point_forecast_adapter,
)

US_DATA_SOURCES: list[UsDataAdapter] = [
    bls_unemployment_adapter,
    usgs_hawaii_earthquakes_adapter,
    cdc_county_obesity_adapter,
    ncei_annual_temperature_adapter,
    noaa_sea_level_adapter,
    treasury_avg_interest_rate_adapter,
    fema_disaster_declarations_adapter,
    openfda_food_recalls_adapter,
    usgs_peak_streamflow_adapter,
    cpsc_product_recalls_adapter,
    cfpb_consumer_complaints_adapter,
    treasury_debt_to_penny_adapter,
    sec_edgar_filings_adapter,
    fdic_bank_directory_adapter,
    clinicaltrials_studies_adapter,
    nws_point_forecast_adapter,
    usaspending_agencies_adapter,
    epa_envirofacts_facilities_adapter,
    ncbi_pubmed_search_adapter,
    cdc_socrata_catalogue_adapter,
    healthdata_socrata_catalogue_adapter,
    nyc_open_data_catalogue_adapter,
    bts_transportation_stats_adapter,
    estimatetax_income_tax_adapter,
    callook_callsigns_adapter,
    college_scorecard_institutions_adapter,
    publicdatahub_hospital_adapter,
    nextbus_transit_vehicles_adapter,
]

PROBE_FAILURES = (UsSourceError, OSError, ValueError, TypeError, KeyError, IndexError)


def get_us_data_source(source_id: str) -> UsDataAdapter | None:
    """Looks up a registered US source by id."""
    return next((source for source in US_DATA_SOURCES if source.id == source_id), None)


def probe_all_us_data_sources(
    options: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Probes registered sources and reports whether each answered."""
    ids = options.get("ids") if options is not None else None
    if ids is not None:
        known = {source.id for source in US_DATA_SOURCES}
        unknown = sorted({source_id for source_id in ids if source_id not in known})
        if unknown:
            raise ValueError(f"Unknown US source ids {', '.join(unknown)}")
    wanted = set(ids) if ids is not None else None
    results: list[dict[str, Any]] = []
    for source in US_DATA_SOURCES:
        if wanted is not None and source.id not in wanted:
            continue
        try:
            data = source.fetch_live(options)
            results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "auth": source.auth,
                    "ok": True,
                    "status": "ok",
                    "sample": json.dumps(data)[:120],
                }
            )
        except PROBE_FAILURES as error:
            results.append(
                {
                    "id": source.id,
                    "name": source.name,
                    "auth": source.auth,
                    "ok": False,
                    "status": str(error),
                }
            )
    return results
