"""Unit tests for the run-export pagination helpers.

Pure-function coverage of the cursor codec, the keyset/range Mongo match
builder, ISO parsing, and the rate-limit cost - none of which touch Mongo
(the router imports `_get_collection` lazily, so these run with no database
and no FastAPI app). Run from the backend/ dir: `pytest`.
"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.routers.exports import (
    OFFICIAL_CHARACTERS,
    _build_match,
    _decode_cursor,
    _encode_cursor,
    _export_cost,
    _parse_iso,
)


# --- _parse_iso ------------------------------------------------------------

def test_parse_iso_aware_passthrough():
    dt = _parse_iso("2026-06-22T19:51:28+00:00", "start")
    assert dt == datetime(2026, 6, 22, 19, 51, 28, tzinfo=timezone.utc)


def test_parse_iso_naive_assumed_utc():
    dt = _parse_iso("2026-06-22T00:00:00", "start")
    assert dt.tzinfo == timezone.utc


def test_parse_iso_rejects_garbage():
    with pytest.raises(HTTPException) as err:
        _parse_iso("not-a-date", "start")
    assert err.value.status_code == 400


# --- cursor codec ----------------------------------------------------------

def test_cursor_roundtrip_with_timestamp():
    dt = datetime(2026, 6, 22, 19, 51, 28, 664000, tzinfo=timezone.utc)
    token = _encode_cursor(dt, "aaaabbbbcccc1111")
    sa, run_hash = _decode_cursor(token)
    assert sa == dt
    assert run_hash == "aaaabbbbcccc1111"


def test_cursor_roundtrip_null_submitted_at():
    # Legacy/null block: submitted_at encodes as empty and decodes back to None.
    token = _encode_cursor(None, "aaaabbbbcccc1111")
    sa, run_hash = _decode_cursor(token)
    assert sa is None
    assert run_hash == "aaaabbbbcccc1111"


def test_decode_cursor_rejects_bad_base64():
    # "x" is a malformed base64 payload (1 char, an invalid length), so the
    # decode raises binascii.Error (a ValueError subclass) before any "|"
    # split - exercising the base64 guard specifically, not the UTF-8 one.
    with pytest.raises(HTTPException) as err:
        _decode_cursor("x")
    assert err.value.status_code == 400


def test_decode_cursor_rejects_missing_separator():
    import base64

    # Valid base64 but no "|" separator -> the unpack fails -> 400.
    token = base64.urlsafe_b64encode(b"noseparator").decode("ascii")
    with pytest.raises(HTTPException) as err:
        _decode_cursor(token)
    assert err.value.status_code == 400


# --- _build_match ----------------------------------------------------------

def _char_clause(match):
    """Pull the official-character clause out of a match (order-independent)."""
    clause = match if "character" in match else next(
        c for c in match["$and"] if "character" in c
    )
    return set(clause["character"]["$in"])


def test_build_match_no_params_is_just_character_filter():
    match = _build_match(None, None, None)
    # No range/cursor -> the single character clause, not wrapped in $and.
    assert "$and" not in match
    assert _char_clause(match) == OFFICIAL_CHARACTERS


def test_build_match_half_open_range():
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    end = datetime(2026, 6, 20, tzinfo=timezone.utc)
    match = _build_match(start, end, None)
    range_clause = next(c for c in match["$and"] if "submitted_at" in c)
    assert range_clause["submitted_at"] == {"$gte": start, "$lt": end}


def test_build_match_start_only():
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    match = _build_match(start, None, None)
    range_clause = next(c for c in match["$and"] if "submitted_at" in c)
    assert range_clause["submitted_at"] == {"$gte": start}


def test_build_match_cursor_inside_null_block():
    # Cursor with sa=None: take remaining nulls by _id, then everything timed.
    match = _build_match(None, None, (None, "abc"))
    or_clause = next(c for c in match["$and"] if "$or" in c)["$or"]
    assert {"submitted_at": None, "_id": {"$gt": "abc"}} in or_clause
    assert {"submitted_at": {"$ne": None}} in or_clause


def test_build_match_cursor_past_nulls():
    sa = datetime(2026, 6, 10, tzinfo=timezone.utc)
    match = _build_match(None, None, (sa, "abc"))
    or_clause = next(c for c in match["$and"] if "$or" in c)["$or"]
    # Strictly after (sa, abc) in (submitted_at, _id) order.
    assert {"submitted_at": {"$gt": sa}} in or_clause
    assert {"submitted_at": sa, "_id": {"$gt": "abc"}} in or_clause


# --- _export_cost ----------------------------------------------------------

class _FakeRequest:
    def __init__(self, query):
        self.query_params = query


def test_export_cost_paged_is_cheap():
    assert _export_cost(_FakeRequest({"limit": "5000"})) == 1


def test_export_cost_full_dump_is_expensive():
    assert _export_cost(_FakeRequest({})) == 60
