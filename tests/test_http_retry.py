"""Retry policy.

`retry_if_exception_type(httpx.HTTPError)` retried 4xx, which can never succeed —
three attempts with exponential backoff per hopeless call. These pin the narrowing.
"""

import httpx
import pytest
from botocore.exceptions import ClientError

from agent.http_retry import is_transient, is_transient_bedrock


def _status(code: int) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://example.test")
    return httpx.HTTPStatusError("e", request=req, response=httpx.Response(code, request=req))


@pytest.mark.parametrize("code", [400, 401, 403, 404, 409, 422])
def test_client_errors_are_not_retried(code):
    assert not is_transient(_status(code))


@pytest.mark.parametrize("code", [429, 500, 502, 503, 504])
def test_server_errors_and_throttling_are_retried(code):
    assert is_transient(_status(code))


@pytest.mark.parametrize("exc", [
    httpx.ConnectTimeout("t"), httpx.ReadTimeout("t"),
    httpx.ConnectError("c"), httpx.RemoteProtocolError("r"),
])
def test_transport_failures_are_retried(exc):
    assert is_transient(exc)


def test_non_http_exceptions_are_not_retried():
    assert not is_transient(ValueError("unrelated"))


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "m"}}, "Converse")


@pytest.mark.parametrize("code", [
    "ValidationException", "AccessDeniedException",
    "ResourceNotFoundException", "UnrecognizedClientException",
])
def test_terminal_bedrock_errors_are_not_retried(code):
    assert not is_transient_bedrock(_client_error(code))


@pytest.mark.parametrize("code", [
    "ThrottlingException", "ModelTimeoutException",
    "InternalServerException", "ServiceUnavailableException",
])
def test_transient_bedrock_errors_are_retried(code):
    assert is_transient_bedrock(_client_error(code))


def test_unknown_bedrock_errors_still_retry():
    """Unknown codes keep the old behaviour — only known-hopeless cases fail fast."""
    assert is_transient_bedrock(_client_error("SomeNewException"))
    assert is_transient_bedrock(Exception("no response attr"))
