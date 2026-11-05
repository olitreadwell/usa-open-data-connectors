"""Clinical trials, biomedical literature, hospitals, facilities, and banks."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .common import UsDataAdapter, require_dict, require_list
from .errors import UsSourceApiError, UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json

CLINICALTRIALS_STUDIES_API_BASE = "https://clinicaltrials.gov/api/v2/studies"
NCBI_EUTILS_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EPA_ENVIROFACTS_API_BASE = "https://data.epa.gov/efservice"
FDIC_BANK_API_BASE = "https://banks.data.fdic.gov/api/institutions"
PUBLICDATAHUB_API_BASE = "https://publicdatahub.org"


def parse_clinical_trials_studies_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of ClinicalTrials.gov studies."""
    parsed = require_dict(payload, "clinicaltrials-studies")
    rows = require_list(parsed.get("studies"), "clinicaltrials-studies")
    if not rows:
        raise UsSourceParseError(
            "clinicaltrials-studies", "The response carried no studies"
        )
    studies: list[dict[str, Any]] = []
    for row in rows:
        protocol = row.get("protocolSection") if isinstance(row, dict) else None
        if not isinstance(protocol, dict):
            raise UsSourceParseError(
                "clinicaltrials-studies", "A study has no protocol section"
            )
        identification = protocol.get("identificationModule") or {}
        status = protocol.get("statusModule") or {}
        design = protocol.get("designModule") or {}
        conditions = protocol.get("conditionsModule") or {}
        sponsor = protocol.get("sponsorCollaboratorsModule") or {}
        nct_id = identification.get("nctId")
        title = identification.get("briefTitle")
        if nct_id is None or title is None:
            raise UsSourceParseError(
                "clinicaltrials-studies",
                "A study arrived without its registry id or brief title",
            )
        enrollment = design.get("enrollmentInfo") or {}
        sponsor_name = (sponsor.get("leadSponsor") or {}).get("name")
        studies.append(
            {
                "nctId": nct_id,
                "briefTitle": title,
                "overallStatus": status.get("overallStatus", ""),
                "studyType": design.get("studyType"),
                "phases": design.get("phases", []),
                "conditions": conditions.get("conditions", []),
                "leadSponsor": sponsor_name,
                "enrollmentCount": enrollment.get("count"),
                "enrollmentType": enrollment.get("type"),
                "startDate": (status.get("startDateStruct") or {}).get("date"),
                "lastUpdatePostDate": (
                    status.get("lastUpdatePostDateStruct") or {}
                ).get("date"),
            }
        )
    counts: dict[str, int] = {}
    for study in studies:
        status = study["overallStatus"]
        counts[status] = counts.get(status, 0) + 1
    return {
        "studies": studies,
        "studyCount": len(studies),
        "statusCounts": [
            {"status": status, "studyCount": count}
            for status, count in sorted(
                counts.items(), key=lambda item: (-item[1], item[0])
            )
        ],
        "nextPageToken": parsed.get("nextPageToken"),
    }


def parse_ncbi_pubmed_search_payload(payload: Any) -> dict[str, Any]:
    """Parses one NCBI PubMed search response."""
    parsed = require_dict(payload, "ncbi-pubmed-search")
    result = parsed.get("esearchresult")
    if not isinstance(result, dict):
        raise UsSourceParseError(
            "ncbi-pubmed-search", "The response carried no result block"
        )
    if result.get("error") is not None:
        raise UsSourceApiError("ncbi-pubmed-search", str(result["error"]))
    try:
        total = int(result["count"])
    except (KeyError, TypeError, ValueError) as error:
        raise UsSourceParseError(
            "ncbi-pubmed-search", "Unreadable match count"
        ) from error
    pmids = result.get("idlist", [])
    translations = [
        {"from": entry["from"], "to": entry["to"]}
        for entry in result.get("translationset", [])
        if isinstance(entry, dict) and "from" in entry and "to" in entry
    ]
    return {
        "totalCount": total,
        "returnedCount": len(pmids),
        "pmids": pmids,
        "queryTranslation": result.get("querytranslation", ""),
        "translationSet": translations,
    }


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def parse_epa_envirofacts_facilities_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of EPA Envirofacts facilities."""
    if isinstance(payload, dict) and payload.get("error") is not None:
        raise UsSourceApiError("epa-envirofacts-facilities", str(payload["error"]))
    rows = require_list(payload, "epa-envirofacts-facilities")
    if not rows:
        raise UsSourceParseError(
            "epa-envirofacts-facilities", "The response carried no rows"
        )
    facilities: list[dict[str, Any]] = []
    for row in rows:
        if (
            not isinstance(row, dict)
            or row.get("tri_facility_id") is None
            or row.get("facility_name") is None
            or row.get("state_abbr") is None
        ):
            raise UsSourceParseError(
                "epa-envirofacts-facilities",
                "A facility row is missing its id, name, or state",
            )
        parent = row.get("parent_co_name")
        parent_text = None if parent is None else str(parent).strip()
        facilities.append(
            {
                "facilityId": row["tri_facility_id"],
                "facilityName": row["facility_name"],
                "streetAddress": row.get("street_address", ""),
                "city": row.get("city_name", ""),
                "countyName": row.get("county_name", ""),
                "stateAbbr": row["state_abbr"],
                "postalCode": row.get("zip_code", ""),
                "region": row.get("region", ""),
                "closed": row.get("fac_closed_ind") == "1",
                "parentCompanyName": None
                if not parent_text or parent_text == "NA"
                else parent_text,
            }
        )
    counties: dict[str, int] = {}
    for facility in facilities:
        county = facility["countyName"]
        counties[county] = counties.get(county, 0) + 1
    closed = sum(1 for facility in facilities if facility["closed"])
    return {
        "facilities": facilities,
        "facilityCount": len(facilities),
        "openCount": len(facilities) - closed,
        "closedCount": closed,
        "counties": [
            {"countyName": name, "facilityCount": count}
            for name, count in sorted(
                counties.items(), key=lambda item: (-item[1], item[0])
            )
        ],
    }


def parse_fdic_bank_directory_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of the FDIC bank directory."""
    parsed = require_dict(payload, "fdic-bank-directory")
    if isinstance(parsed.get("errors"), list) and parsed["errors"]:
        raise UsSourceApiError("fdic-bank-directory", "The API rejected the request")
    rows = require_list(parsed.get("data"), "fdic-bank-directory")
    if not rows:
        raise UsSourceParseError("fdic-bank-directory", "The response carried no rows")
    banks: list[dict[str, Any]] = []
    for row in rows:
        data = row.get("data") if isinstance(row, dict) else None
        if not isinstance(data, dict) or any(
            data.get(key) is None for key in ("ID", "NAME", "CITY", "STALP")
        ):
            raise UsSourceParseError(
                "fdic-bank-directory",
                "A bank row is missing its id, name, city, or state",
            )
        banks.append(
            {
                "id": data["ID"],
                "name": data["NAME"],
                "city": data["CITY"],
                "stateAbbr": data["STALP"],
            }
        )
    states: dict[str, int] = {}
    for bank in banks:
        state = bank["stateAbbr"]
        states[state] = states.get(state, 0) + 1
    total = (
        (parsed.get("totals") or {}).get("count")
        or (parsed.get("meta") or {}).get("total")
        or len(banks)
    )
    return {
        "banks": banks,
        "bankCount": len(banks),
        "totalBanks": total,
        "states": [
            {"stateAbbr": state, "bankCount": count}
            for state, count in sorted(
                states.items(), key=lambda item: (-item[1], item[0])
            )
        ],
    }


def parse_publicdatahub_hospital_payload(payload: Any) -> dict[str, Any]:
    """Parses one PublicDataHub hospital quality export."""
    raw = require_dict(payload, "publicdatahub-hospital-quality")
    measures_raw = require_list(raw.get("measures"), "publicdatahub-hospital-quality")
    provenance_raw = require_dict(
        raw.get("provenance"), "publicdatahub-hospital-quality"
    )
    address_raw = raw.get("address") or {}
    measures = [
        {
            "key": measure["key"],
            "label": measure["label"],
            "period": measure.get("period"),
            "value": measure.get("value"),
            "unit": measure.get("unit"),
            "nationalRank": measure.get("national_rank"),
            "tiedWith": measure.get("tied_with"),
            "definition": measure.get("definition"),
        }
        for measure in measures_raw
        if isinstance(measure, dict)
    ]
    provenance = {
        "source": _text(provenance_raw.get("source")),
        "agency": provenance_raw["agency"],
        "datasetUrl": provenance_raw["dataset_url"],
        "licence": provenance_raw["licence"],
        "licenceUrl": _text(provenance_raw.get("licence_url")),
        "dataAsOf": provenance_raw["data_as_of"],
        "versionId": _text(provenance_raw.get("version_id")),
        "retrievedFrom": _text(provenance_raw.get("retrieved_from")),
    }
    hospital = {
        "id": raw["id"],
        "slug": raw["slug"],
        "name": raw["name"],
        "entityType": raw["entity_type"],
        "hospitalType": _text(raw.get("hospital_type")),
        "ownership": _text(raw.get("ownership")),
        "emergencyServices": _text(raw.get("emergency_services")),
        "cmsCcn": _text(raw.get("cms_ccn")),
        "address": {
            "street": _text(address_raw.get("street")),
            "city": _text(address_raw.get("city")),
            "state": _text(address_raw.get("state")),
            "zip": _text(address_raw.get("zip")),
            "county": _text(address_raw.get("county")),
            "countyGeoid": _text(address_raw.get("county_geoid")),
        },
        "phone": _text(raw.get("phone")),
        "website": _text(raw.get("website")),
        "qualityScore": raw.get("quality_score"),
        "measures": measures,
        "provenance": provenance,
    }
    by_key = {measure["key"]: measure["value"] for measure in measures}
    return {
        "hospital": hospital,
        "measureCount": len(measures),
        "reportedMeasureCount": sum(
            1 for measure in measures if measure["value"] is not None
        ),
        "overallRating": by_key.get("overall_rating")
        if isinstance(by_key.get("overall_rating"), (int, float))
        else None,
        "betterThanNationalCount": by_key.get("measures_better")
        if isinstance(by_key.get("measures_better"), (int, float))
        else None,
        "worseThanNationalCount": by_key.get("measures_worse")
        if isinstance(by_key.get("measures_worse"), (int, float))
        else None,
        "dataAsOf": provenance["dataAsOf"],
        "agency": provenance["agency"],
        "datasetUrl": provenance["datasetUrl"],
        "licence": provenance["licence"],
    }


def _json_fetcher(url: str, parser: Any) -> Any:
    def fetch_live(options: Mapping[str, Any] | None = None) -> Any:
        return parser(get_json(url))

    return fetch_live


clinicaltrials_studies_adapter = UsDataAdapter(
    id="clinicaltrials-studies",
    name="ClinicalTrials.gov studies",
    auth="none",
    description="Registered clinical studies from ClinicalTrials.gov, one row per study, with the status, phase, lead sponsor, and enrollment.",
    fetch_live=_json_fetcher(
        f"{CLINICALTRIALS_STUDIES_API_BASE}?pageSize=10",
        parse_clinical_trials_studies_payload,
    ),
    parse=parse_clinical_trials_studies_payload,
    load_fixture=lambda: parse_clinical_trials_studies_payload(
        read_fixture_json("clinicaltrials-studies-2026-10-05.json")
    ),
)

ncbi_pubmed_search_adapter = UsDataAdapter(
    id="ncbi-pubmed-search",
    name="NCBI PubMed search",
    auth="none",
    description="PubMed literature searches through the NCBI Entrez Utilities API, with the match count, a page of PubMed ids, and how NCBI translated the query.",
    fetch_live=_json_fetcher(
        f"{NCBI_EUTILS_API_BASE}/esearch.fcgi?db=pubmed&term=asthma&retmode=json&retmax=10",
        parse_ncbi_pubmed_search_payload,
    ),
    parse=parse_ncbi_pubmed_search_payload,
    load_fixture=lambda: parse_ncbi_pubmed_search_payload(
        read_fixture_json("ncbi-pubmed-search-2026-10-05.json")
    ),
)

epa_envirofacts_facilities_adapter = UsDataAdapter(
    id="epa-envirofacts-facilities",
    name="EPA Envirofacts facilities",
    auth="none",
    description="Toxics Release Inventory facilities from the EPA Envirofacts service, one row per site, with its county, address, and open or closed status.",
    fetch_live=_json_fetcher(
        f"{EPA_ENVIROFACTS_API_BASE}/TRI_FACILITY/STATE_ABBR/RI/rows/0:9/JSON",
        parse_epa_envirofacts_facilities_payload,
    ),
    parse=parse_epa_envirofacts_facilities_payload,
    load_fixture=lambda: parse_epa_envirofacts_facilities_payload(
        read_fixture_json("epa-envirofacts-facilities-2026-10-05.json")
    ),
)

fdic_bank_directory_adapter = UsDataAdapter(
    id="fdic-bank-directory",
    name="FDIC bank directory",
    auth="none",
    description="Insured banks in the FDIC institution directory, one row per bank, with the city and state of its main office.",
    fetch_live=_json_fetcher(
        f"{FDIC_BANK_API_BASE}?limit=10&fields=NAME,CITY,STALP",
        parse_fdic_bank_directory_payload,
    ),
    parse=parse_fdic_bank_directory_payload,
    load_fixture=lambda: parse_fdic_bank_directory_payload(
        read_fixture_json("fdic-bank-directory-2026-10-05.json")
    ),
)

publicdatahub_hospital_adapter = UsDataAdapter(
    id="publicdatahub-hospital-quality",
    name="PublicDataHub hospital quality",
    auth="none",
    description="Medicare-certified hospital quality measures from CMS, republished by PublicDataHub with national ranks, provenance, and an explicit null for every value the agency did not publish.",
    fetch_live=_json_fetcher(
        f"{PUBLICDATAHUB_API_BASE}/api/export/hospital/mayo-clinic-hospital-rochester.json",
        parse_publicdatahub_hospital_payload,
    ),
    parse=parse_publicdatahub_hospital_payload,
    load_fixture=lambda: parse_publicdatahub_hospital_payload(
        read_fixture_json("publicdatahub-hospital-quality-2026-10-21.json")
    ),
)
