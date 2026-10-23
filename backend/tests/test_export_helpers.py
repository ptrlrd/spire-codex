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
    _page_params,
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
    clause = (
        match
        if "character" in match
        else next(c for c in match["$and"] if "character" in c)
    )
    return set(clause["character"]["$in"])


def test_build_match_no_params_is_official_runs_filter():
    match = _build_match(None, None, None)
    # No range/cursor -> only the baseline clauses: official characters,
    # the official ascension range (A11+ is modded), and not hidden.
    assert _char_clause(match) == OFFICIAL_CHARACTERS
    ascension_clause = next(c for c in match["$and"] if "ascension" in c)
    assert ascension_clause["ascension"] == {"$gte": 0, "$lte": 10}
    assert {"hidden": {"$ne": True}} in match["$and"]
    assert len(match["$and"]) == 3


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
    # Planner-friendly keyset: the cursor timestamp becomes the range's
    # lower bound and the $or only trims the boundary instant.
    range_clause = next(c for c in match["$and"] if "submitted_at" in c)
    assert range_clause["submitted_at"] == {"$gte": sa}
    or_clause = next(c for c in match["$and"] if "$or" in c)["$or"]
    assert {"submitted_at": {"$gt": sa}} in or_clause
    assert {"_id": {"$gt": "abc"}} in or_clause


def test_build_match_cursor_tightens_start_window():
    # The 2026-08-31 timeout: start plus a cursor deep inside the window.
    # The cursor must REPLACE the lower bound (one index-boundable range),
    # not stack a second submitted_at predicate the planner abandons.
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    sa = datetime(2026, 7, 15, 15, 43, 22, 695000, tzinfo=timezone.utc)
    match = _build_match(start, None, (sa, "a31903b18a1472c1"))
    range_clause = next(c for c in match["$and"] if "submitted_at" in c)
    assert range_clause["submitted_at"] == {"$gte": sa}


def test_build_match_cursor_before_start_keeps_start():
    # A cursor from an earlier window must not widen [start, end).
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    sa = datetime(2026, 6, 10, tzinfo=timezone.utc)
    match = _build_match(start, None, (sa, "abc"))
    range_clause = next(c for c in match["$and"] if "submitted_at" in c)
    assert range_clause["submitted_at"] == {"$gte": start}


def test_build_match_version_pins_build_id():
    # The paged pull for one game version filters on the indexed build_id.
    match = _build_match(None, None, None, "v0.111.0")
    assert {"build_id": "v0.111.0"} in match["$and"]
    assert len(match["$and"]) == 4


# --- _page_params ------------------------------------------------------------


def test_page_params_all_absent():
    # Called directly (not via FastAPI), Query defaults are the sentinel
    # objects, so pass the absent values explicitly.
    assert _page_params(None, None, None) == (None, None, None)


def test_page_params_parses_and_decodes():
    sa = datetime(2026, 6, 22, 19, 51, 28, tzinfo=timezone.utc)
    token = _encode_cursor(sa, "aaaabbbbcccc1111")
    start, end, cursor = _page_params("2026-06-01T00:00:00", None, token)
    assert start == datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert end is None
    assert cursor == (sa, "aaaabbbbcccc1111")


def test_page_params_rejects_malformed_before_handler():
    # The dependency is what turns junk into a 400 before the rate limiter
    # charges the request; a malformed value must raise, not pass through.
    with pytest.raises(HTTPException) as err:
        _page_params("not-a-date", None, None)
    assert err.value.status_code == 400
    with pytest.raises(HTTPException) as err:
        _page_params(None, None, "x")
    assert err.value.status_code == 400


# --- _export_cost ----------------------------------------------------------


class _FakeRequest:
    def __init__(self, query):
        self.query_params = query


def test_export_cost_paged_is_cheap():
    assert _export_cost(_FakeRequest({"limit": "5000"})) == 1


def test_export_cost_full_dump_is_expensive():
    assert _export_cost(_FakeRequest({})) == 60


def test_stream_survives_poison_runs(tmp_path, monkeypatch):
    # A run that raises mid-stream must be SKIPPED, not kill the generator —
    # a dead generator hands clients a 200 with a truncated gzip.
    import gzip as _gzip
    import io as _io

    from app.routers import exports

    good = tmp_path / "good.json"
    good.write_text('{"win": true}', encoding="utf-8")
    poison = tmp_path / "poison.json"
    poison.write_bytes(b"\xff\xfe not utf8 at all")
    monkeypatch.setattr(exports, "_RUNS_DIR", tmp_path)

    chunks = b"".join(exports._stream_runs_jsonl(["good", "poison", "good"]))
    lines = (
        _gzip.GzipFile(fileobj=_io.BytesIO(chunks)).read().decode().strip().split("\n")
    )
    assert len(lines) == 2  # both good copies, poison skipped
    assert all(
        '"run_hash": "good"'.replace(" ", "") in ln.replace(" ", "") for ln in lines
    )
