from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(eq=False)
class AppError(Exception):
    status_code: int
    code: str
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.code}: {self.message}"


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=404, code="not_found", message=message, details=details)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=403, code="forbidden", message=message, details=details)


class BadRequestError(AppError):
    def __init__(self, message: str = "Bad request", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=400, code="bad_request", message=message, details=details)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=409, code="conflict", message=message, details=details)


class NotImplementedAppError(AppError):
    def __init__(self, message: str = "Not implemented", *, details: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=501, code="not_implemented", message=message, details=details)


class ExternalServiceError(AppError):
    def __init__(
        self,
        message: str = "External service error",
        *,
        details: dict[str, Any] | None = None,
        status_code: int = 502,
        code: str = "external_service_error",
    ) -> None:
        super().__init__(status_code=status_code, code=code, message=message, details=details)
