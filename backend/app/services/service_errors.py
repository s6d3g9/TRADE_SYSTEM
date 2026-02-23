from __future__ import annotations


class ServiceError(Exception):
    """Service-layer error with an HTTP-ish status code.

    We keep a status_code + detail so API handlers can map this to HTTPException,
    while graph/node execution can surface the detail as a failed node message.
    """

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = int(status_code)
        self.detail = str(detail)
