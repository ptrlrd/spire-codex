import subprocess
import sys
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))
import seed_predict
from app.services import lake_stats


def test_missing_binary_skips(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SIM_CLI_PATH", str(tmp_path / "absent"))
    assert seed_predict.build()["skipped"]
    assert "binary absent" in capsys.readouterr().out


def test_stage_runs_both_builds_and_publishes(tmp_path, monkeypatch):
    monkeypatch.setattr(seed_predict, "LAKE", tmp_path)
    monkeypatch.setattr(lake_stats, "_connect", lambda **_: duckdb.connect())
    con = duckdb.connect()
    con.execute(
        "COPY (SELECT 'AAAA' AS seed) TO ? (FORMAT parquet)",
        [str(tmp_path / "seed_profiles.parquet")],
    )
    con.close()
    stub = tmp_path / "sim-cli"
    script = tmp_path / "stub.py"
    script.write_text("""import json, sys
from pathlib import Path
args = sys.argv[1:]
get = lambda key: args[args.index(key) + 1]
build, party = get('--build'), get('--party')
key = f'AAAA|{build}|1|{party}'
row = dict(seed_key=key, evidence=f'predicted:{build}:{party}', win=None, kind='boss', id='BOSS', act=1, floor=None, seat=0, n=1)
out = Path(get('--out'))
out.write_text(json.dumps(row) + '\\n')
Path(str(out) + '.profiles.jsonl').write_text(json.dumps(dict(seed_key=key, seed='AAAA', build_id=build, player_count=1, party=[party])) + '\\n')
""")
    stub.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n')
    stub.chmod(0o755)
    monkeypatch.setenv("SIM_CLI_PATH", str(stub))
    assert seed_predict.build() == {"skipped": False, "seeds": 10}
    con = duckdb.connect()
    rows = con.execute(
        "SELECT * FROM read_parquet(?)", [str(tmp_path / seed_predict.FACTS_NAME)]
    ).fetchall()
    assert len(rows) == 10 and all(row[2] is None for row in rows)
    assert {row[1].split(":")[1] for row in rows} == set(seed_predict.BUILDS)
    assert (
        len(
            con.execute(
                "SELECT * FROM read_parquet(?)",
                [str(tmp_path / seed_predict.PROFILES_NAME)],
            ).fetchall()
        )
        == 10
    )
    previous = (tmp_path / seed_predict.FACTS_NAME).read_bytes()
    stub.write_text("#!/bin/sh\nexit 1\n")
    with pytest.raises(subprocess.CalledProcessError):
        seed_predict.build()
    assert (tmp_path / seed_predict.FACTS_NAME).read_bytes() == previous
    con.close()
