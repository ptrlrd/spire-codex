"""A new changelog picks up the matching Steam patch notes post from the
news archive, the way the committed changelogs carry them."""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("diff_data", ROOT / "tools/diff_data.py")
diff_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diff_data)


def _post(news, gid, title, contents="notes body"):
    (news / f"{gid}.json").write_text(
        json.dumps({"gid": gid, "title": title, "contents": contents})
    )


def test_matches_the_post_for_exactly_this_version(tmp_path):
    _post(tmp_path, "1", "Beta Patch Notes - v0.113.0", "the real notes")
    _post(tmp_path, "2", "Beta Hotfix Patch Notes - v0.113.1", "hotfix")
    _post(tmp_path, "3", "The Neowsletter - v0.113.0 special")
    (tmp_path / "index.json").write_text("[]")
    assert diff_data.official_patch_notes("0.113.0", tmp_path) == {
        "steam_url": "https://store.steampowered.com/news/app/2868840/view/1",
        "notes": "the real notes",
    }
    assert diff_data.official_patch_notes("v0.113.1", tmp_path)["notes"] == "hotfix"


def test_no_post_means_no_fields(tmp_path):
    _post(tmp_path, "1", "Beta Patch Notes - v0.113.0")
    assert diff_data.official_patch_notes("0.11", tmp_path) == {}
    assert diff_data.official_patch_notes("0.114.0", tmp_path) == {}


def test_committed_changelog_carries_the_official_notes():
    log = json.loads((ROOT / "data-beta/v0.113.0/changelogs/0.113.0.json").read_text())
    assert log["title"] == "Beta Patch Notes - v0.113.0"
    assert log["notes"].startswith("At long last")
    assert log["steam_url"].endswith("/1849192144184507")
    assert diff_data.official_patch_notes("0.113.0")["notes"] == log["notes"]
