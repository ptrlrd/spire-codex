import json
import subprocess

from fastapi.testclient import TestClient

from app.main import app


def test_sandbox_runs_solver(monkeypatch):
    from app.routers import sandbox

    monkeypatch.setattr(sandbox.shutil, "which", lambda _: "/stub/sim-cli")
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        with open(command[3], encoding="utf-8") as file:
            assert json.load(file)["seed"] == "AAAA"
        return subprocess.CompletedProcess(command, 0, '{"lines":[],"exhaustive":true}')

    monkeypatch.setattr(sandbox.subprocess, "run", run)
    client = TestClient(app)
    response = client.post(
        "/api/sandbox/solve",
        json={"schema": "sandbox_position/3", "seed": "AAAA"},
    )
    assert response.status_code == 200
    assert response.json()["exhaustive"] is True
    assert calls[0][0][-2:] == ["--budget-ms", "2000"]
    assert calls[0][1]["timeout"] == 5


def test_sandbox_rejects_invalid_input():
    client = TestClient(app)
    assert client.post("/api/sandbox/solve", content=b"bad").status_code == 422
    assert (
        client.post("/api/sandbox/solve", json={"schema": "elsewhere"}).status_code
        == 422
    )
