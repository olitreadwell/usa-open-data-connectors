"""Uniform adapters for NZ public data sources.

Every adapter has the same shape: a live fetch, a strict parse, and a
committed fixture fallback so builds work offline.
"""

from __future__ import annotations

import json
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from importlib.resources import files
from typing import Any, Callable, Dict, List, Optional

import httpx

from .errors import NzSourceApiError, NzSourceParseError

DEFAULT_TIMEOUT_MS = 30_000
USER_AGENT = "nz-open-data-connectors (Language=Python)"


@dataclass
class NzDataAdapter:
    """One NZ data source behind a uniform interface."""

    id: str
    name: str
    auth: str
    description: str
    fetch_live: Callable[[Optional[str]], Any]
    parse: Callable[[Any], Any]
    load_fixture: Callable[[], Any]


@dataclass
class NzSourceProbe:
    """Result of a live verification probe against one source."""

    id: str
    name: str
    auth: str
    ok: bool
    status: str
    sample: Optional[str] = None


@dataclass
class AdeDataflow:
    dataflow_id: str
    version: str
    agency_id: str
    name: str
    dimensions: List[str]


@dataclass
class AdeSearchResult:
    num_found: int
    dataflows: List[AdeDataflow]


@dataclass
class DataGovtNzDataset:
    name: str
    title: str
    notes: str
    metadata_modified: str
    url: str
    organization: Optional[str]


@dataclass
class DataGovtNzSearchResult:
    count: int
    datasets: List[DataGovtNzDataset]


@dataclass
class DataGovtDatastoreResult:
    resource_id: str
    total: int
    records: List[Dict[str, Any]]


@dataclass
class DigitalNzRecord:
    id: int
    title: str
    description: str
    content_partner: str
    collection: str
    url: str
    categories: List[str] = field(default_factory=list)
    thumbnail_url: str = ""
    large_thumbnail_url: str = ""
    object_url: str = ""
    source_url: str = ""
    display_date: str = ""


@dataclass
class GeoNetQuake:
    public_id: str
    time: str
    depth_km: float
    magnitude: float
    mmi: int
    locality: str
    quality: str
    latitude: float
    longitude: float


@dataclass
class GeoNetQuakeSummary:
    total: int
    strongest: Optional[GeoNetQuake]
    shallowest: Optional[GeoNetQuake]
    by_magnitude_band: Dict[str, int]


@dataclass
class LinzLayer:
    id: int
    title: str
    url: str


@dataclass
class NzorName:
    name_id: str
    class_name: str
    full_name: str


@dataclass
class NzorSearchResult:
    total: int
    names: List[NzorName]


@dataclass
class TradeMeCategory:
    name: str
    number: str
    path: str
    is_leaf: bool
    subcategories: List["TradeMeCategory"] = field(default_factory=list)


def read_fixture_json(filename: str) -> Any:
    """Reads a committed fixture as parsed JSON."""
    return json.loads(
    files("nzdata").joinpath("fixtures").joinpath(filename).read_text(encoding="utf-8")
)


def read_fixture_text(filename: str) -> str:
    """Reads a committed fixture as raw text."""
    return files("nzdata").joinpath("fixtures").joinpath(filename).read_text(encoding="utf-8")


def _get_text(url: str, headers: Optional[Dict[str, str]] = None) -> str:
    try:
        response = httpx.get(
            url, headers=headers or {}, timeout=DEFAULT_TIMEOUT_MS / 1000, follow_redirects=True
        )
    except httpx.HTTPError as exc:
        raise NzSourceApiError("HTTP request", str(exc)) from exc
    if response.status_code < 200 or response.status_code >= 300:
        raise NzSourceApiError("HTTP request", f"HTTP {response.status_code}")
    return response.text


def _get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Any:
    return json.loads(_get_text(url, headers))


# --- Aotearoa Data Explorer search -----------------------------------------


def parse_ade_search_results(payload: Any) -> AdeSearchResult:
    if not isinstance(payload, dict):
        raise NzSourceParseError("ADE search", "invalid search payload")
    return AdeSearchResult(
        num_found=payload.get("numFound", 0),
        dataflows=[
            AdeDataflow(
                dataflow_id=flow.get("dataflowId", ""),
                version=flow.get("version", ""),
                agency_id=flow.get("agencyId", ""),
                name=flow.get("name", ""),
                dimensions=flow.get("dimensions", []),
            )
            for flow in payload.get("dataflows", [])
        ],
    )


def search_ade_tables(query: str, limit: int = 20) -> AdeSearchResult:
    url = (
        "https://explore.data.stats.govt.nz/sfs/api/search?tenant=public"
        f"&q={urllib.parse.quote(query)}&limit={limit}"
    )
    return parse_ade_search_results(_get_json(url))


ade_search_adapter = NzDataAdapter(
    id="ade-search",
    name="Aotearoa Data Explorer search index",
    auth="none",
    description="Searches ADE table IDs and titles by keyword.",
    fetch_live=lambda _api_key: search_ade_tables("median annual earnings", limit=5),
    parse=parse_ade_search_results,
    load_fixture=lambda: parse_ade_search_results(read_fixture_json("ade-search-earnings.json")),
)


# --- data.govt.nz catalogue -------------------------------------------------


def parse_data_govt_nz_datasets(payload: Any) -> DataGovtNzSearchResult:
    if not isinstance(payload, dict):
        raise NzSourceParseError("data.govt.nz", "invalid search payload")
    result = payload.get("result", {})
    if not isinstance(result, dict):
        raise NzSourceParseError("data.govt.nz", "invalid search payload")
    return DataGovtNzSearchResult(
        count=result.get("count", 0),
        datasets=[
            DataGovtNzDataset(
                name=dataset.get("name", ""),
                title=dataset.get("title", ""),
                notes=dataset.get("notes", ""),
                metadata_modified=dataset.get("metadata_modified", ""),
                url=dataset.get("url", ""),
                organization=(
                    dataset["organization"].get("title")
                    if isinstance(dataset.get("organization"), dict)
                    else None
                ),
            )
            for dataset in result.get("results", [])
        ],
    )


def search_data_govt_nz_datasets(query: str) -> DataGovtNzSearchResult:
    url = (
        "https://catalogue.data.govt.nz/api/3/action/package_search"
        f"?q={urllib.parse.quote(query)}&rows=20"
    )
    return parse_data_govt_nz_datasets(_get_json(url))


data_govt_nz_adapter = NzDataAdapter(
    id="data-govt-nz",
    name="data.govt.nz catalogue",
    auth="none",
    description="CKAN package_search over the national open data catalogue.",
    fetch_live=lambda _api_key: search_data_govt_nz_datasets("sheep"),
    parse=parse_data_govt_nz_datasets,
    load_fixture=lambda: parse_data_govt_nz_datasets(
        read_fixture_json("data-govt-nz-search-sheep.json")
    ),
)


# --- data.govt.nz datastore ------------------------------------------------


MSD_BENEFIT_RESOURCE_ID = "9144a616-9ab1-4475-972b-ac42c1f891b7"


def parse_data_govt_datastore_rows(payload: Any) -> DataGovtDatastoreResult:
    if not isinstance(payload, dict):
        raise NzSourceParseError("data.govt.nz datastore", "invalid datastore payload")
    result = payload.get("result", {})
    if not isinstance(result, dict):
        raise NzSourceParseError("data.govt.nz datastore", "invalid datastore payload")
    return DataGovtDatastoreResult(
        resource_id=result.get("resource_id", ""),
        total=result.get("total", 0),
        records=result.get("records", []),
    )


def fetch_data_govt_datastore_rows(resource_id: str, limit: int = 1000) -> DataGovtDatastoreResult:
    url = (
        "https://catalogue.data.govt.nz/api/3/action/datastore_search"
        f"?resource_id={urllib.parse.quote(resource_id)}&limit={limit}"
    )
    return parse_data_govt_datastore_rows(_get_json(url))


data_govt_datastore_adapter = NzDataAdapter(
    id="data-govt-datastore",
    name="data.govt.nz datastore (MSD benefits)",
    auth="none",
    description="CKAN datastore_search rows, defaulting to national MSD benefit data.",
    fetch_live=lambda _api_key: fetch_data_govt_datastore_rows(MSD_BENEFIT_RESOURCE_ID),
    parse=parse_data_govt_datastore_rows,
    load_fixture=lambda: parse_data_govt_datastore_rows(
        read_fixture_json("data-govt-datastore-msd-benefits.json")
    ),
)


# --- DigitalNZ -------------------------------------------------------------


def parse_digital_nz_records(payload: Any) -> List[DigitalNzRecord]:
    if not isinstance(payload, dict):
        raise NzSourceParseError("DigitalNZ", "invalid search payload")
    search = payload.get("search", {})
    if not isinstance(search, dict):
        raise NzSourceParseError("DigitalNZ", "invalid search payload")
    return [
        DigitalNzRecord(
            id=record.get("id", 0),
            title=record.get("title", ""),
            description=record.get("description") or "",
            content_partner=record.get("display_content_partner") or "",
            collection=record.get("display_collection") or "",
            url=record.get("landing_url") or "",
            categories=list(record.get("category") or []),
            thumbnail_url=record.get("thumbnail_url") or "",
            large_thumbnail_url=record.get("large_thumbnail_url") or "",
            object_url=record.get("object_url") or "",
            source_url=record.get("source_url") or "",
            display_date=record.get("display_date") or "",
        )
        for record in search.get("results", [])
    ]


def search_digital_nz_records(query: str, api_key: Optional[str] = None) -> List[DigitalNzRecord]:
    params = [("text", query), ("per_page", "20")]
    if api_key is not None:
        params.append(("api_key", api_key))
    url = "https://api.digitalnz.org/v3/records.json?" + urllib.parse.urlencode(params)
    return parse_digital_nz_records(_get_json(url))


# DigitalNZ media types, mirroring the TypeScript package.
DIGITAL_NZ_MEDIA_TYPES = (
    "images",
    "newspapers",
    "videos",
    "audio",
    "literature",
    "artwork",
)

# Maps each media type to the DigitalNZ category filter value. Artwork shares
# the Images category because DigitalNZ has no separate artwork category.
DIGITAL_NZ_CATEGORY_FILTERS = {
    "images": "Images",
    "newspapers": "Newspapers",
    "videos": "Videos",
    "audio": "Audio",
    "literature": "Books",
    "artwork": "Images",
}


def search_digital_nz_media(
    query: str, media_type: str, api_key: Optional[str] = None
) -> List[DigitalNzRecord]:
    """Searches DigitalNZ for one media type with preview image URLs."""
    if media_type not in DIGITAL_NZ_CATEGORY_FILTERS:
        raise ValueError(
            f"Unknown media type: {media_type}. Choose one of: {', '.join(DIGITAL_NZ_MEDIA_TYPES)}"
        )
    params = [
        ("text", query),
        ("per_page", "20"),
        ("and[category][]", DIGITAL_NZ_CATEGORY_FILTERS[media_type]),
    ]
    if api_key is not None:
        params.append(("api_key", api_key))
    url = "https://api.digitalnz.org/v3/records.json?" + urllib.parse.urlencode(params)
    return parse_digital_nz_records(_get_json(url))


digital_nz_adapter = NzDataAdapter(
    id="digitalnz",
    name="DigitalNZ (National Library)",
    auth="none",
    description="Search over 1.7 million digitised NZ records.",
    fetch_live=lambda api_key: search_digital_nz_records("sheep", api_key),
    parse=parse_digital_nz_records,
    load_fixture=lambda: parse_digital_nz_records(read_fixture_json("digitalnz-search-sheep.json")),
)


# --- GeoNet ----------------------------------------------------------------


def parse_geonet_quakes(payload: Any) -> List[GeoNetQuake]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise NzSourceParseError("GeoNet", "invalid GeoJSON payload")
    features = payload.get("features", [])
    if not isinstance(features, list):
        raise NzSourceParseError("GeoNet", "invalid GeoJSON payload")
    quakes: List[GeoNetQuake] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        quakes.append(
            GeoNetQuake(
                public_id=props.get("publicID", ""),
                time=props.get("time", ""),
                depth_km=props.get("depth", 0.0),
                magnitude=props.get("magnitude", 0.0),
                mmi=props.get("mmi", 0),
                locality=props.get("locality", ""),
                quality=props.get("quality", ""),
                latitude=coordinates[1] if len(coordinates) > 1 else 0.0,
                longitude=coordinates[0] if len(coordinates) > 0 else 0.0,
            )
        )
    return quakes


def summarize_geonet_quakes(quakes: List[GeoNetQuake]) -> GeoNetQuakeSummary:
    by_magnitude_band: Dict[str, int] = {}
    for quake in quakes:
        band = "5+" if quake.magnitude >= 5 else "4-5" if quake.magnitude >= 4 else "3-4"
        by_magnitude_band[band] = by_magnitude_band.get(band, 0) + 1
    strongest = max(quakes, key=lambda q: q.magnitude) if quakes else None
    shallowest = min(quakes, key=lambda q: q.depth_km) if quakes else None
    return GeoNetQuakeSummary(
        total=len(quakes),
        strongest=strongest,
        shallowest=shallowest,
        by_magnitude_band=by_magnitude_band,
    )


def fetch_geonet_felt_quakes(min_mmi: int = 3) -> List[GeoNetQuake]:
    url = f"https://api.geonet.org.nz/quake?MMI={min_mmi}"
    return parse_geonet_quakes(_get_json(url))


geonet_adapter = NzDataAdapter(
    id="geonet",
    name="GeoNet (GNS Science)",
    auth="none",
    description="Recent felt earthquakes (MMI >= 3) as GeoJSON.",
    fetch_live=lambda _api_key: fetch_geonet_felt_quakes(3),
    parse=parse_geonet_quakes,
    load_fixture=lambda: parse_geonet_quakes(read_fixture_json("geonet-quakes-mmi3.json")),
)


# --- LINZ ------------------------------------------------------------------


def parse_linz_layers(payload: Any) -> List[LinzLayer]:
    if not isinstance(payload, list):
        raise NzSourceParseError("LINZ", "invalid layer search payload")
    return [
        LinzLayer(id=layer.get("id", 0), title=layer.get("title", ""), url=layer.get("url", ""))
        for layer in payload
    ]


def search_linz_layers(query: str, api_key: Optional[str] = None) -> List[LinzLayer]:
    url = f"https://data.linz.govt.nz/services/api/v1/layers?search={urllib.parse.quote(query)}"
    headers = {"x-api-key": api_key} if api_key is not None else None
    return parse_linz_layers(_get_json(url, headers))


linz_adapter = NzDataAdapter(
    id="linz",
    name="LINZ Data Service catalogue",
    auth="none",
    description="Searches LINZ layers (property titles, parcels, boundaries).",
    fetch_live=lambda api_key: search_linz_layers("property", api_key),
    parse=parse_linz_layers,
    load_fixture=lambda: parse_linz_layers(read_fixture_json("linz-layer-search.json")),
)


# --- NZOR ------------------------------------------------------------------


def _child_text(element: ET.Element, name: str) -> str:
    child = element.find(name)
    return child.text if child is not None and child.text is not None else ""


def parse_nzor_names(payload: str) -> NzorSearchResult:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise NzSourceParseError("NZOR", "invalid XML payload") from exc
    total_node = root.find("Total")
    if total_node is None or total_node.text is None:
        raise NzSourceParseError("NZOR", "missing Response/Total in XML payload")
    try:
        total = int(total_node.text)
    except ValueError as exc:
        raise NzSourceParseError("NZOR", "invalid Response/Total in XML payload") from exc
    names = [
        NzorName(
            name_id=_child_text(name_node, "NameId"),
            class_name=_child_text(name_node, "Class"),
            full_name=_child_text(name_node, "FullName"),
        )
        for name_node in root.findall("Names/Name")
    ]
    return NzorSearchResult(total=total, names=names)


def search_nzor_names(query: str) -> NzorSearchResult:
    url = f"https://data.nzor.org.nz/names?q={urllib.parse.quote(query)}"
    return parse_nzor_names(_get_text(url))


nzor_adapter = NzDataAdapter(
    id="nzor",
    name="NZ Organisms Register",
    auth="none",
    description="Search 170,000+ scientific and vernacular organism names.",
    fetch_live=lambda _api_key: search_nzor_names("kiwi"),
    parse=lambda payload: parse_nzor_names(str(payload)),
    load_fixture=lambda: parse_nzor_names(read_fixture_text("nzor-names-kiwi.xml")),
)


# --- Trade Me --------------------------------------------------------------


def _to_trademe_category(category: Any) -> TradeMeCategory:
    if not isinstance(category, dict):
        raise NzSourceParseError("Trade Me", "invalid category payload")
    return TradeMeCategory(
        name=category.get("Name", ""),
        number=category.get("Number", ""),
        path=category.get("Path", ""),
        is_leaf=category.get("IsLeaf", False),
        subcategories=[
            _to_trademe_category(child) for child in category.get("Subcategories", [])
        ],
    )


def parse_trademe_categories(payload: Any) -> TradeMeCategory:
    return _to_trademe_category(payload)


def fetch_trademe_categories() -> TradeMeCategory:
    return parse_trademe_categories(_get_json("https://api.trademe.co.nz/v1/Categories.json"))


trademe_adapter = NzDataAdapter(
    id="trademe",
    name="Trade Me categories",
    auth="none",
    description="The public Trade Me category tree.",
    fetch_live=lambda _api_key: fetch_trademe_categories(),
    parse=parse_trademe_categories,
    load_fixture=lambda: parse_trademe_categories(read_fixture_json("trademe-categories.json")),
)


# --- Registry --------------------------------------------------------------


NZ_DATA_SOURCES: List[NzDataAdapter] = [
    geonet_adapter,
    data_govt_nz_adapter,
    data_govt_datastore_adapter,
    ade_search_adapter,
    digital_nz_adapter,
    trademe_adapter,
    nzor_adapter,
    linz_adapter,
]


def get_nz_data_source(source_id: str) -> Optional[NzDataAdapter]:
    """Looks up a source adapter by id."""
    return next((source for source in NZ_DATA_SOURCES if source.id == source_id), None)


def _json_default(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {key: _json_default(getattr(value, key)) for key in value.__dataclass_fields__}
    return str(value)


def probe_nz_data_source(adapter: NzDataAdapter, api_key: Optional[str] = None) -> NzSourceProbe:
    """Probes one source with a live fetch and reports the outcome."""
    try:
        data = adapter.fetch_live(api_key)
        return NzSourceProbe(
            id=adapter.id,
            name=adapter.name,
            auth=adapter.auth,
            ok=True,
            status="ok",
            sample=json.dumps(data, default=_json_default)[:120],
        )
    except Exception as exc:  # noqa: BLE001 - probes report any failure
        return NzSourceProbe(
            id=adapter.id,
            name=adapter.name,
            auth=adapter.auth,
            ok=False,
            status=str(exc),
        )


def probe_all_nz_data_sources(api_keys: Optional[Dict[str, str]] = None) -> List[NzSourceProbe]:
    """Probes every registered source, with optional per-source keys."""
    keys = api_keys or {}
    return [probe_nz_data_source(source, keys.get(source.id)) for source in NZ_DATA_SOURCES]
