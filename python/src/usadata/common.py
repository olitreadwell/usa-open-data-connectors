"""Shared adapter types and parsing helpers."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import (
    Any,
)

from .errors import UsSourceParseError


@dataclass(frozen=True)
class UsDataAdapter:
    """One US data source behind a uniform interface."""

    id: str
    name: str
    auth: str
    description: str
    fetch_live: Callable[[Mapping[str, Any] | None], Any]
    parse: Callable[[Any], Any]
    load_fixture: Callable[[], Any]


def require_dict(payload: Any, source: str) -> dict[str, Any]:
    """Returns a JSON object or raises a parse error."""
    if not isinstance(payload, dict):
        raise UsSourceParseError(source, "expected a JSON object")
    return payload


def require_list(payload: Any, source: str) -> list[Any]:
    """Returns a JSON array or raises a parse error."""
    if not isinstance(payload, list):
        raise UsSourceParseError(source, "expected a JSON array")
    return payload


def require_non_empty(value: Sequence[Any], source: str, what: str) -> None:
    """Raises when a sequence that must carry rows is empty."""
    if len(value) == 0:
        raise UsSourceParseError(source, f"The response carried no {what}")


def as_number(value: Any) -> Any | None:
    """Reads a finite number from an API value, or None."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else number


def as_int(value: Any) -> int | None:
    """Reads an integer from an API value, or None."""
    number = as_number(value)
    return int(number) if number is not None and number.is_integer() else None


def normalize_number(value: float) -> Any:
    """Returns an integer when a computed number is integral, matching JSON's number form."""
    return int(value) if float(value).is_integer() else value


def sequential_sum(values: Iterable[float]) -> float:
    """Adds values left to right, matching JavaScript's floating-point accumulation."""
    total = 0.0
    for value in values:
        total += value
    return total


def count_pairs(values: Iterable[str], label: str) -> list[dict[str, Any]]:
    """Counts labels, most frequent first, ties broken by label."""
    counts: dict[str, int] = {}
    for value in values:
        if value:
            counts[value] = counts.get(value, 0) + 1
    return [
        {label: key, "count" if label == "name" else "recallCount": count}
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def count_named(values: Iterable[str]) -> list[dict[str, Any]]:
    """Counts values into name/count pairs."""
    return count_pairs(values, "name")


def count_recalls(values: Iterable[str], label: str) -> list[dict[str, Any]]:
    """Counts values into a named recall count list."""
    counts: dict[str, int] = {}
    for value in values:
        if value:
            counts[value] = counts.get(value, 0) + 1
    return [
        {label: key, "recallCount": count}
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def extreme(rows: Sequence[dict[str, Any]], key: str, maximum: bool) -> dict[str, Any]:
    """Picks the first row with the largest or smallest value."""
    if not rows:
        raise UsSourceParseError("summary", "No rows to summarise")
    best = rows[0]
    for row in rows[1:]:
        if (row[key] > best[key]) if maximum else (row[key] < best[key]):
            best = row
    return best


def median(values: Iterable[float]) -> float | None:
    """Returns the median of the values, or None when there are none."""
    ordered = sorted(values)
    if not ordered:
        return None
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def sorted_counts(values: Iterable[str], key: str = "name") -> list[tuple[str, int]]:
    """Counts values and returns tuples, most frequent first."""
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))
