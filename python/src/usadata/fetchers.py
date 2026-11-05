"""Live fetch helpers shared by US source adapters."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from .http import get_json, get_text


def json_fetcher(url: str, parser: Callable[[Any], Any]) -> Callable[..., Any]:
    """Builds a live fetch function that reads JSON and parses it."""

    def fetch_live(options: Mapping[str, Any] | None = None) -> Any:
        return parser(get_json(url))

    return fetch_live


def text_fetcher(url: str, parser: Callable[[Any], Any]) -> Callable[..., Any]:
    """Builds a live fetch function that reads text and parses it."""

    def fetch_live(options: Mapping[str, Any] | None = None) -> Any:
        return parser(get_text(url))

    return fetch_live
