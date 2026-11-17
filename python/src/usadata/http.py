"""Shared HTTP helpers for US source adapters."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Mapping
from typing import Any

from .errors import UsSourceApiError

DEFAULT_TIMEOUT_SECONDS = 30.0
USER_AGENT = "usa-open-data-connectors (Language=Python)"


def _request(
    url: str,
    headers: Mapping[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, **dict(headers or {})}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise UsSourceApiError(
            "http", f"HTTP {error.code}", status=error.code
        ) from error
    except urllib.error.URLError as error:
        raise UsSourceApiError("http", f"request failed: {error.reason}") from error


def get_text(url: str, headers: Mapping[str, str] | None = None) -> str:
    """Reads one URL as text."""
    return _request(url, headers).decode("utf-8")


def get_json(url: str, headers: Mapping[str, str] | None = None) -> Any:
    """Reads one URL as parsed JSON."""
    return json.loads(get_text(url, headers))


def post_json(
    url: str,
    payload: Any,
    headers: Mapping[str, str] | None = None,
) -> Any:
    """Posts one JSON body and reads the JSON answer."""
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            **dict(headers or {}),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise UsSourceApiError(
            "http", f"HTTP {error.code}", status=error.code
        ) from error
    except urllib.error.URLError as error:
        raise UsSourceApiError("http", f"request failed: {error.reason}") from error
