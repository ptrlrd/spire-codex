import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

LAKE = Path(os.environ.get("LAKE_DIR", "/lake"))
BUILDS = ("v0.107.1", "v0.111.0")
CHARACTERS = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")
FACTS_NAME = "seed_facts_predicted.parquet"
PROFILES_NAME = "seed_profiles_predicted.parquet"


def build() -> dict:
    from app.services import lake_stats

    binary = os.environ.get("SIM_CLI_PATH", "/opt/spire-sim/sim-cli")
    if not shutil.which(binary):
        print(f"seed predictions skipped: binary absent at {binary}", flush=True)
        return {"skipped": True, "seeds": 0}
    source = LAKE / "seed_profiles.parquet"
    if not source.exists():
        print("seed predictions skipped: seed profiles absent", flush=True)
        return {"skipped": True, "seeds": 0}
    con = lake_stats._connect(build=True)
    try:
        seeds = [
            row[0]
            for row in con.execute(
                "SELECT DISTINCT seed FROM read_parquet(?) ORDER BY seed LIMIT ?",
                [str(source), int(os.environ.get("SIM_SEED_LIMIT", "10000"))],
            ).fetchall()
        ]
        if not seeds:
            return {"skipped": True, "seeds": 0}
        with tempfile.TemporaryDirectory(prefix="seed_predict.", dir=LAKE) as directory:
            work = Path(directory)
            seed_file = work / "seeds.txt"
            seed_file.write_text("\n".join(seeds) + "\n", encoding="utf-8")
            facts = []
            profiles = []
            for build_id in BUILDS:
                for character in CHARACTERS:
                    output = work / f"{build_id}_{character}.jsonl"
                    command = [
                        binary,
                        "predict-batch",
                        "--build",
                        build_id,
                        "--party",
                        character,
                        "--seeds-file",
                        str(seed_file),
                        "--out",
                        str(output),
                    ]
                    data_root = os.environ.get("SIM_DATA_ROOT")
                    if data_root:
                        command.extend(["--data-root", data_root])
                    subprocess.run(
                        command,
                        check=True,
                        timeout=600,
                        cwd=Path(binary).resolve().parent,
                    )
                    facts.append(str(output))
                    profiles.append(str(output) + ".profiles.jsonl")
            facts_tmp = work / FACTS_NAME
            profiles_tmp = work / PROFILES_NAME
            con.execute(
                "CREATE TEMP TABLE predicted_facts AS SELECT seed_key::VARCHAR AS seed_key, "
                "evidence::VARCHAR AS evidence, win::BOOLEAN AS win, kind::VARCHAR AS kind, "
                "id::VARCHAR AS id, act::INTEGER AS act, floor::INTEGER AS floor, "
                "seat::INTEGER AS seat, sum(n)::INTEGER AS n FROM read_json_auto(?, union_by_name=true) "
                "GROUP BY 1,2,3,4,5,6,7,8",
                [facts],
            )
            con.execute(
                "COPY (SELECT * FROM predicted_facts ORDER BY kind, id, seed_key) TO ? "
                "(FORMAT parquet, COMPRESSION zstd)",
                [str(facts_tmp)],
            )
            con.execute(
                "CREATE TEMP TABLE predicted_profiles AS SELECT * FROM read_json_auto(?, union_by_name=true)",
                [profiles],
            )
            con.execute(
                "COPY (SELECT * FROM predicted_profiles ORDER BY seed_key) TO ? (FORMAT parquet, COMPRESSION zstd)",
                [str(profiles_tmp)],
            )
            count = con.execute(
                "SELECT count(DISTINCT seed_key) FROM predicted_facts"
            ).fetchone()[0]
            facts_tmp.replace(LAKE / FACTS_NAME)
            profiles_tmp.replace(LAKE / PROFILES_NAME)
        return {"skipped": False, "seeds": count}
    finally:
        con.close()


if __name__ == "__main__":
    print(json.dumps(build()))
