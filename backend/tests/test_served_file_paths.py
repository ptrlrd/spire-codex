import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "tag",
    [
        "..%2Fachievements",
        "..%2F..%2Fdata%2Fcards",
        "%2Fetc%2Fhostname",
        "eng%2Fcards",
        ".hidden",
    ],
)
def test_changelog_tag_cannot_leave_the_changelog_folder(tag):
    assert client.get(f"/api/changelogs/{tag}").status_code == 404


def test_real_changelog_tag_still_loads():
    r = client.get("/api/changelogs/1.0.0")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


@pytest.mark.parametrize(
    "path",
    ["achievements.json", "eng/cards.json", "runs.db", "guides.json"],
)
def test_data_mount_serves_images_only(path):
    assert client.get(f"/static/data-beta/{path}").status_code == 404
