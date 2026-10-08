"""Client for the Aotearoa Data Explorer (ADE) API.

SDMX 2.1 REST, base URL https://api.data.stats.govt.nz/rest/. Server-side
only: SDMX responses can be large, so never call this from a browser.
"""

from __future__ import annotations

import csv
import io
import json
import math
import urllib.parse
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx

from .errors import StatsNzApiError, StatsNzError, StatsNzParseError

DEFAULT_BASE_URL = "https://api.data.stats.govt.nz/rest"
DEFAULT_VERSION = "1.0"
DEFAULT_TIMEOUT_MS = 30_000
USER_AGENT = "nz-open-data-connectors (Language=Python)"
VALID_FORMATS = ("csv", "csvfilewithlabels", "jsondata")

FetchResult = Tuple[int, str]
FetchImpl = Callable[[str, Dict[str, str], int], FetchResult]


@dataclass
class StatsNzDataflow:
    """One table in the ADE catalogue."""

    id: str
    agency_id: str
    version: str
    title: str


@dataclass
class StatsNzObservation:
    """One row of data: dimension codes plus a value."""

    dimensions: Dict[str, str]
    value: Optional[float]
    labels: Optional[Dict[str, str]] = None
    status: Optional[str] = None


@dataclass
class StatsNzCodelistItem:
    """One dimension code mapped to a human label."""

    id: str
    name: str


@dataclass
class StatsNzCodelist:
    """A dimension codelist: codes to labels."""

    id: str
    agency_id: str
    version: str
    items: List[StatsNzCodelistItem]


def _default_fetch(url: str, headers: Dict[str, str], timeout_ms: int) -> FetchResult:
    try:
        response = httpx.get(
            url, headers=headers, timeout=timeout_ms / 1000, follow_redirects=True
        )
        return response.status_code, response.text
    except httpx.HTTPError as exc:
        raise StatsNzApiError(
            f"Stats NZ request failed: {exc}", status=0, retryable=True, url=url
        ) from exc


def parse_stats_nz_csv(text: str, dataflow_id: str) -> List[StatsNzObservation]:
    """Parses an ADE CSV payload (codes only) into typed observations."""
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    if reader.fieldnames is None or "OBS_VALUE" not in reader.fieldnames:
        raise StatsNzParseError("Stats NZ CSV is missing the OBS_VALUE column")
    suffix = f"_{dataflow_id}"
    label_suffix = f"_LABEL{suffix}"
    observations: List[StatsNzObservation] = []
    for record in reader:
        dimensions: Dict[str, str] = {}
        labels: Dict[str, str] = {}
        for key, cell_value in record.items():
            if key in ("DATAFLOW", "OBS_VALUE", "OBS_STATUS"):
                continue
            if key.endswith(label_suffix):
                labels[key[: -len(label_suffix)]] = cell_value or ""
                continue
            if key.endswith(suffix):
                dimensions[key[: -len(suffix)]] = cell_value or ""
        raw_value = record.get("OBS_VALUE") or ""
        value: Optional[float] = None if raw_value == "" else float(raw_value)
        if value is not None and not math.isfinite(value):
            raise StatsNzParseError(f"Invalid OBS_VALUE in Stats NZ CSV: {raw_value}")
        status = (record.get("OBS_STATUS") or "").strip()
        observation = StatsNzObservation(dimensions=dimensions, value=value)
        if labels:
            observation.labels = labels
        if status:
            observation.status = status
        observations.append(observation)
    return observations


def _format_value(value: Optional[float]) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _escape_csv_cell(value: str) -> str:
    if "," in value or '"' in value or "\n" in value:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'
    return value


def serialize_stats_nz_rows_to_csv(rows: List[StatsNzObservation]) -> str:
    """Serializes typed observations back to CSV (dimensions, value, status)."""
    if not rows:
        return ""
    dimension_keys = sorted({key for row in rows for key in row.dimensions})
    has_status = any(row.status is not None for row in rows)
    header = dimension_keys + ["value"] + (["status"] if has_status else [])
    lines = [",".join(header)]
    for row in rows:
        cells = [row.dimensions.get(key, "") for key in dimension_keys]
        cells.append(_format_value(row.value))
        if has_status:
            cells.append(row.status or "")
        lines.append(",".join(_escape_csv_cell(cell) for cell in cells))
    return "\n".join(lines)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _as_record(value: Any) -> Optional[Dict[str, Any]]:
    return value if isinstance(value, dict) else None


def _as_string(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _simplify(element: ET.Element) -> Dict[str, Any]:
    """Converts an ElementTree element into plain dicts keyed by local names."""
    result: Dict[str, Any] = {}
    for key, value in element.attrib.items():
        result[f"@_{_local_name(key)}"] = value
    children = list(element)
    if not children:
        if element.text and element.text.strip():
            result["#text"] = element.text.strip()
        return result
    for child in children:
        name = _local_name(child.tag)
        child_value = _simplify(child)
        if name in result:
            if not isinstance(result[name], list):
                result[name] = [result[name]]
            result[name].append(child_value)
        else:
            result[name] = child_value
    return result


def parse_dataflow_catalogue_xml(xml: str) -> List[StatsNzDataflow]:
    """Parses the ADE dataflow catalogue XML into dataflow records."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise StatsNzParseError("Failed to parse Stats NZ dataflow catalogue XML") from exc
    doc = {_local_name(root.tag): _simplify(root)}
    structure = _as_record((_as_record(doc) or {}).get("Structure"))
    if structure is None:
        raise StatsNzParseError("Stats NZ dataflow catalogue XML has no Structure element")
    structures = _as_record(structure.get("Structures"))
    dataflows_node = _as_record(structures.get("Dataflows")) if structures else None
    dataflows_value = dataflows_node.get("Dataflow") if dataflows_node else None
    dataflows = (
        dataflows_value
        if isinstance(dataflows_value, list)
        else [dataflows_value]
        if dataflows_value is not None
        else []
    )
    return [
        StatsNzDataflow(
            id=_as_string((_as_record(flow) or {}).get("@_id")),
            agency_id=_as_string((_as_record(flow) or {}).get("@_agencyID")),
            version=_as_string((_as_record(flow) or {}).get("@_version")),
            title=_as_string((_as_record((_as_record(flow) or {}).get("Name")) or {}).get("#text")),
        )
        for flow in dataflows
    ]


def _to_codelist_items(codes_value: Any) -> List[StatsNzCodelistItem]:
    codes = (
        codes_value
        if isinstance(codes_value, list)
        else [codes_value]
        if codes_value is not None
        else []
    )
    return [
        StatsNzCodelistItem(
            id=_as_string((_as_record(code) or {}).get("@_id")),
            name=_as_string((_as_record((_as_record(code) or {}).get("Name")) or {}).get("#text")),
        )
        for code in codes
    ]


def parse_codelist_xml(xml: str) -> StatsNzCodelist:
    """Parses an ADE codelist XML payload into a codelist."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise StatsNzParseError("Failed to parse Stats NZ codelist XML") from exc
    doc = {_local_name(root.tag): _simplify(root)}
    structure = _as_record((_as_record(doc) or {}).get("Structure"))
    structures = _as_record(structure.get("Structures")) if structure else None
    codelists = _as_record(structures.get("Codelists")) if structures else None
    codelists_value = codelists.get("Codelist") if codelists else None
    codelist_list = (
        codelists_value
        if isinstance(codelists_value, list)
        else [codelists_value]
        if codelists_value is not None
        else []
    )
    codelist = _as_record(codelist_list[0]) if codelist_list else None
    if codelist is None:
        raise StatsNzParseError("Stats NZ codelist XML has no Codelist element")
    return StatsNzCodelist(
        id=_as_string(codelist.get("@_id")),
        agency_id=_as_string(codelist.get("@_agencyID")),
        version=_as_string(codelist.get("@_version")),
        items=_to_codelist_items(codelist.get("Code")),
    )


class StatsNzClient:
    """Typed client for the Aotearoa Data Explorer API."""

    def __init__(
        self,
        subscription_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        fetch_impl: Optional[FetchImpl] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._subscription_key = subscription_key
        self._timeout_ms = timeout_ms
        self._fetch = fetch_impl or _default_fetch

    def _send_request(self, path: str, accept: str) -> str:
        url = f"{self._base_url}{path}"
        headers: Dict[str, str] = {
            "Accept": accept,
            "Cache-Control": "no-cache",
            "user-agent": USER_AGENT,
        }
        if self._subscription_key is not None:
            headers["Ocp-Apim-Subscription-Key"] = self._subscription_key
        status, body = self._fetch(url, headers, self._timeout_ms)
        if status < 200 or status >= 300:
            message = f"Stats NZ API request failed with status {status}"
            try:
                parsed = json.loads(body)
                if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
                    message = parsed["message"]
            except json.JSONDecodeError:
                pass
            raise StatsNzApiError(
                message, status=status, retryable=status == 429 or status >= 500, url=url
            )
        return body

    def get_data(
        self,
        dataflow_id: str,
        key: str = "all",
        version: Optional[str] = None,
        format: str = "csv",
    ) -> List[StatsNzObservation]:
        """Pulls data rows for a dataflow. Keyless for AGR_* tables."""
        if format not in VALID_FORMATS:
            raise StatsNzError(f"Unsupported Stats NZ response format: {format}")
        if format == "jsondata":
            raise StatsNzError("jsondata format is not implemented in the Python port")
        version = version or DEFAULT_VERSION
        path = (
            f"/data/STATSNZ,{urllib.parse.quote(dataflow_id)},{urllib.parse.quote(version)}"
            f"/{urllib.parse.quote(key)}?format={format}"
        )
        body = self._send_request(path, "text/csv")
        return parse_stats_nz_csv(body, dataflow_id)

    def get_dataflow_catalogue(self) -> List[StatsNzDataflow]:
        """Lists every dataflow in the ADE catalogue. Keyless."""
        body = self._send_request("/dataflow/STATSNZ/all", "application/xml")
        return parse_dataflow_catalogue_xml(body)

    def get_codelist(
        self, codelist_id: str, version: Optional[str] = None
    ) -> StatsNzCodelist:
        """Resolves dimension codes to labels. Needs a subscription key."""
        version_segment = "" if version is None else f"/{urllib.parse.quote(version)}"
        path = f"/codelist/STATSNZ/{urllib.parse.quote(codelist_id)}{version_segment}"
        body = self._send_request(path, "application/xml")
        return parse_codelist_xml(body)


def create_stats_nz_client(
    subscription_key: Optional[str] = None,
    base_url: str = DEFAULT_BASE_URL,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    fetch_impl: Optional[FetchImpl] = None,
) -> StatsNzClient:
    """Builds a Stats NZ client. Keys are read from the caller, never the network."""
    return StatsNzClient(
        subscription_key=subscription_key,
        base_url=base_url,
        timeout_ms=timeout_ms,
        fetch_impl=fetch_impl,
    )
