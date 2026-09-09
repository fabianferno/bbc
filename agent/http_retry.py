"""Shared retry policy for outbound HTTP calls.

`retry_if_exception_type(httpx.HTTPError)` is too broad: `HTTPStatusError` subclasses
`HTTPError`, so a 400 or 401 — which will never succeed on retry — burns three attempts
with exponential backoff before surfacing. That inflated cycle wall-clock noticeably
when Manifold was rejecting sub-minimum bets.

Retry only what can plausibly succeed on a second attempt:
  - transport failures (connect/read timeouts, DNS, reset connections)
  - 5xx, which are server-side and usually transient
  - 429, where backing off is the documented remedy
Everything else (4xx: bad request, auth, not found) fails fast.
"""

from __future__ import annotations

import httpx
from tenacity import retry_if_exception

RETRYABLE_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})


def is_transient(exc: BaseException) -> bool:
    """True if `exc` is worth retrying."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code in RETRYABLE_STATUS or code >= 500
    # Any other httpx.HTTPError is a transport-level failure.
    return isinstance(exc, httpx.HTTPError)


retry_transient = retry_if_exception(is_transient)


# Bedrock errors arrive as botocore ClientError, not httpx, so they need their own
# predicate. These are terminal: retrying cannot change the outcome, and doing so
# multiplies latency on every candidate in a cycle.
TERMINAL_BEDROCK_ERRORS: frozenset[str] = frozenset({
    "ValidationException",
    "AccessDeniedException",
    "ResourceNotFoundException",
    "UnrecognizedClientException",
    "InvalidSignatureException",
})


def is_transient_bedrock(exc: BaseException) -> bool:
    """True if a Bedrock call is worth retrying.

    Unknown error codes retry, preserving prior behaviour — only the known-hopeless
    cases fail fast.
    """
    code = getattr(exc, "response", {}).get("Error", {}).get("Code") if hasattr(exc, "response") else None
    if code in TERMINAL_BEDROCK_ERRORS:
        return False
    return True


retry_transient_bedrock = retry_if_exception(is_transient_bedrock)
