"""Stable error keys shared by all repair generation providers."""


class RepairUnavailable(RuntimeError):
    """Raised when a repair generation provider cannot complete a request."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)
