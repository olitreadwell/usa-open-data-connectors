"""Errors shared by every US source adapter."""

from __future__ import annotations


class UsSourceError(Exception):
    """Base error for any US data source client."""


class UsSourceApiError(UsSourceError):
    """The remote API rejected the request or returned an error body."""

    def __init__(self, source: str, message: str, status: int | None = None) -> None:
        super().__init__(f"{source}: {message}")
        self.source = source
        self.status = status


class UsSourceParseError(UsSourceError):
    """The remote payload did not match the expected shape."""

    def __init__(self, source: str, message: str) -> None:
        super().__init__(f"{source}: {message}")
        self.source = source
