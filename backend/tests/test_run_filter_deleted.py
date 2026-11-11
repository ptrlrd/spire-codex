from app.services.runs_db_mongo import _run_filter


def test_username_search_leaves_out_deleted_runs():
    q = _run_filter(username="SomePlayer")
    assert q["username_lower"] == "someplayer"
    assert q["deleted_at"] is None


def test_admin_username_search_keeps_deleted_runs():
    q = _run_filter(username="SomePlayer", include_hidden=True)
    assert "deleted_at" not in q


def test_unscoped_browse_query_is_unchanged():
    assert _run_filter() == {"hidden": {"$ne": True}}
