"""Common schemas and response models."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error type/code")
    message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any] | None = Field(default=None, description="Additional error context")


class SuccessResponse(BaseModel):
    """Generic success response."""

    ok: bool = Field(default=True, description="Operation success flag")
    message: str | None = Field(default=None, description="Optional success message")
    data: dict[str, Any] | None = Field(default=None, description="Optional response payload")


class PaginatedResponse(BaseModel):
    """Paginated list response."""

    items: list[Any] = Field(default_factory=list, description="Page items")
    total: int = Field(..., description="Total items count")
    limit: int = Field(..., description="Items per page")
    offset: int = Field(..., description="Page offset")
    has_more: bool = Field(..., description="Whether more pages exist")
