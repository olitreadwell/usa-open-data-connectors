"""Clinical trials, biomedical literature, hospitals, facilities, and banks."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from .common import (
    UsDataAdapter,
    as_number,
    normalize_number,
    require_dict,
    require_list,
    sequential_sum,
)
from .errors import UsSourceApiError, UsSourceParseError
from .fixtures import read_fixture_json
from .http import get_json, post_json

CLINICALTRIALS_STUDIES_API_BASE = "https://clinicaltrials.gov/api/v2/studies"
NCBI_EUTILS_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EPA_ENVIROFACTS_API_BASE = "https://data.epa.gov/efservice"
FDIC_BANK_API_BASE = "https://banks.data.fdic.gov/api/institutions"
PUBLICDATAHUB_API_BASE = "https://publicdatahub.org"
NIH_REPORTER_SEARCH_URL = "https://api.reporter.nih.gov/v2/projects/search"
NIH_REPORTER_DEFAULT_FISCAL_YEAR = 2025
NIH_REPORTER_PAGE_SIZE = 10

NIH_REPORTER_INCLUDE_FIELDS = [
    "ProjectNum",
    "CoreProjectNum",
    "ProjectTitle",
    "FiscalYear",
    "AwardAmount",
    "Organization",
    "PrincipalInvestigators",
    "ProjectStartDate",
    "ProjectEndDate",
    "AgencyIcAdmin",
    "ProjectDetailUrl",
]


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


def build_nih_reporter_search_body(
    query: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Builds the JSON body for one NIH RePORTER project search."""
    options = query or {}
    return {
        "criteria": {
            "fiscal_years": [
                options.get("fiscalYear", NIH_REPORTER_DEFAULT_FISCAL_YEAR)
            ],
            "agencies": ["NIH"],
        },
        "include_fields": NIH_REPORTER_INCLUDE_FIELDS,
        "offset": options.get("offset", 0),
        "limit": options.get("limit", NIH_REPORTER_PAGE_SIZE),
        "sort_field": "award_amount",
        "sort_order": "desc",
    }


def _nih_number(value: Any, source: str, field: str) -> Any:
    """Reads a required number or raises a parse error."""
    number = as_number(value)
    if number is None:
        raise UsSourceParseError(source, f"A project carried an unreadable {field}")
    return number


def _nih_optional_number(value: Any, source: str, field: str) -> Any | None:
    """Reads an optional number, keeping null as None."""
    if value is None:
        return None
    return _nih_number(value, source, field)


def _nih_required_string(value: Any, source: str, field: str) -> str:
    """Reads a required string or raises a parse error."""
    if not isinstance(value, str):
        raise UsSourceParseError(source, f"A project carried an unreadable {field}")
    return value


def _nih_optional_string(value: Any, source: str, field: str) -> str | None:
    """Reads an optional string, keeping null as None."""
    if value is None:
        return None
    return _nih_required_string(value, source, field)


def _normalize_nih_date(value: Any, source: str, field: str) -> str | None:
    """Converts an ISO timestamp or date to YYYY-MM-DD."""
    if value is None:
        return None
    text = _nih_required_string(value, source, field)
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    if match is None:
        raise UsSourceParseError(source, f"Unreadable {field}: {text}")
    return match.group(1)


def _normalize_investigator_name(name: str) -> str:
    """Collapses repeated spaces inside an investigator name."""
    return " ".join(name.split())


def _nih_administering_institute(value: Any, source: str) -> str | None:
    """Reads the NIH institute abbreviation, falling back to its name."""
    if value is None:
        return None
    if not isinstance(value, dict):
        raise UsSourceParseError(source, "A project carried a malformed administering institute")
    abbreviation = value.get("abbreviation")
    if abbreviation is not None and not isinstance(abbreviation, str):
        raise UsSourceParseError(source, "A project carried an unreadable institute abbreviation")
    if isinstance(abbreviation, str) and abbreviation != "":
        return abbreviation
    name = value.get("name")
    if name is None:
        return None
    if not isinstance(name, str):
        raise UsSourceParseError(source, "A project carried an unreadable institute name")
    return name


def _nih_investigators(value: Any, source: str) -> list[str]:
    """Reads and normalises the principal investigator names."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise UsSourceParseError(source, "A project carried a malformed investigator list")
    names: list[str] = []
    for investigator in value:
        if not isinstance(investigator, dict):
            raise UsSourceParseError(source, "An investigator entry is not an object")
        full_name = investigator.get("full_name")
        if full_name is None:
            continue
        if not isinstance(full_name, str):
            raise UsSourceParseError(source, "An investigator carried an unreadable name")
        name = _normalize_investigator_name(full_name)
        if name != "":
            names.append(name)
    return names


def parse_nih_reporter_projects_payload(payload: Any) -> dict[str, Any]:
    """Parses one page of NIH RePORTER project search results."""
    source = "nih-reporter-projects"
    parsed = require_dict(payload, source)
    message = parsed.get("message")
    if message is not None:
        if not isinstance(message, str):
            raise UsSourceParseError(source, "The response carried an unreadable message")
        raise UsSourceApiError(source, message)
    meta = parsed.get("meta")
    rows = parsed.get("results")
    if not isinstance(meta, dict) or not isinstance(rows, list):
        raise UsSourceParseError(
            source, "The response carried no meta block or results array"
        )
    total = _nih_number(meta.get("total"), source, "total")
    offset = _nih_number(meta.get("offset"), source, "offset")
    limit = _nih_number(meta.get("limit"), source, "limit")

    projects: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            raise UsSourceParseError(source, "A project is not an object")
        organization = row.get("organization")
        if not isinstance(organization, dict):
            raise UsSourceParseError(source, "A project arrived without its organization")
        projects.append(
            {
                "projectNumber": _nih_required_string(
                    row.get("project_num"), source, "project number"
                ),
                "coreProjectNumber": _nih_optional_string(
                    row.get("core_project_num"), source, "core project number"
                ),
                "projectTitle": _nih_required_string(
                    row.get("project_title"), source, "project title"
                ),
                "fiscalYear": _nih_number(
                    row.get("fiscal_year"), source, "fiscal year"
                ),
                "awardAmount": _nih_optional_number(
                    row.get("award_amount"), source, "award amount"
                ),
                "organizationName": _nih_required_string(
                    organization.get("org_name"), source, "organization name"
                ),
                "organizationCity": _nih_optional_string(
                    organization.get("org_city"), source, "organization city"
                ),
                "organizationState": _nih_optional_string(
                    organization.get("org_state"), source, "organization state"
                ),
                "principalInvestigators": _nih_investigators(
                    row.get("principal_investigators"), source
                ),
                "administeringInstitute": _nih_administering_institute(
                    row.get("agency_ic_admin"), source
                ),
                "projectStartDate": _normalize_nih_date(
                    row.get("project_start_date"), source, "project start date"
                ),
                "projectEndDate": _normalize_nih_date(
                    row.get("project_end_date"), source, "project end date"
                ),
                "projectDetailUrl": _nih_optional_string(
                    row.get("project_detail_url"), source, "project detail URL"
                ),
            }
        )

    return {
        "projects": projects,
        "projectCount": len(projects),
        "totalCount": total,
        "offset": offset,
        "limit": limit,
        "pageAwardAmountUsd": normalize_number(
            sequential_sum(project["awardAmount"] or 0 for project in projects)
        ),
    }


def _fetch_nih_reporter_projects(
    options: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Reads one page of NIH-funded projects through RePORTER."""
    return parse_nih_reporter_projects_payload(
        post_json(NIH_REPORTER_SEARCH_URL, build_nih_reporter_search_body(options))
    )


nih_reporter_projects_adapter = UsDataAdapter(
    id="nih-reporter-projects",
    name="NIH RePORTER funded projects",
    auth="none",
    description="NIH RePORTER funded projects for one fiscal year, with the project title, award amount, organization, principal investigators, and administering institute.",
    fetch_live=_fetch_nih_reporter_projects,
    parse=parse_nih_reporter_projects_payload,
    load_fixture=lambda: parse_nih_reporter_projects_payload(
        read_fixture_json("nih-reporter-projects-fy2025-2026-11-07.json")
    ),
)
