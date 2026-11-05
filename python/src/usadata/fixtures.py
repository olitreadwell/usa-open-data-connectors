"""Read committed fixtures from the package."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Any


def read_fixture_json(filename: str) -> Any:
    """Reads a committed fixture as parsed JSON."""
    path = files("usadata").joinpath("fixtures").joinpath(filename)
    return json.loads(path.read_text(encoding="utf-8"))


def read_fixture_text(filename: str) -> str:
    """Reads a committed fixture as raw text."""
    path = files("usadata").joinpath("fixtures").joinpath(filename)
    return path.read_text(encoding="utf-8")
