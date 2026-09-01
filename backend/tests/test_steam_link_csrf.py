"""The Steam website flow only links to the signed-in account when the same
browser started it; a callback minted elsewhere must not link."""

from app.routers.auth_steam import web_flow_bound


def test_web_flow_requires_matching_cookie():
    assert web_flow_bound("abc123", "abc123")
    assert not web_flow_bound("abc123", "zzz999")
    assert not web_flow_bound("abc123", "")
    assert not web_flow_bound("", "abc123")
