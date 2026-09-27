"""tools/update.py ends cleanly: a failing step or a missing executable
becomes a one-line error and an exit code, Ctrl+C exits 130, and the game
file lookup finds the Windows pck name and never picks a mod's pck."""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "tools" / "update.py"


@pytest.fixture(scope="module")
def update():
    spec = importlib.util.spec_from_file_location("update_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_failing_step_exits_with_its_code(update, capsys):
    with pytest.raises(SystemExit) as exc:
        update.run([sys.executable, "-c", "import sys; sys.exit(3)"])
    assert exc.value.code == 3
    assert "exited with code 3" in capsys.readouterr().out


def test_missing_executable_exits_one(update, capsys):
    with pytest.raises(SystemExit) as exc:
        update.run(["definitely-not-a-real-tool-xyz"])
    assert exc.value.code == 1
    assert "could not run definitely-not-a-real-tool-xyz" in capsys.readouterr().out


def test_successful_step_returns_the_process(update):
    assert update.run([sys.executable, "-c", "pass"]).returncode == 0


def test_keyboard_interrupt_exits_130(monkeypatch):
    code = (
        "import runpy, sys\n"
        "sys.argv = ['update.py']\n"
        f"SCRIPT_PATH = {str(SCRIPT)!r}\n"
        "import builtins\n"
        f"src = open({str(SCRIPT)!r}).read()\n"
        "src = src.replace('def main():', 'def main():\\n    raise KeyboardInterrupt\\n\\ndef _unused():', 1)\n"
        "exec(compile(src, 'update.py', 'exec'), {'__name__': '__main__', '__file__': SCRIPT_PATH})\n"
    )
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert proc.returncode == 130
    assert "Interrupted" in proc.stdout


def test_game_file_lookup_prefers_the_shipped_pck_and_skips_mods(update, tmp_path):
    (tmp_path / "mods" / "SpireCodex").mkdir(parents=True)
    (tmp_path / "mods" / "SpireCodex" / "SpireCodex.pck").write_bytes(b"x")
    (tmp_path / "data_sts2_windows_x86_64").mkdir()
    (tmp_path / "data_sts2_windows_x86_64" / "sts2.dll").write_bytes(b"x")
    assert update.find_game_files(tmp_path)[0] is None
    (tmp_path / "SlayTheSpire2.pck").write_bytes(b"x")
    pck, dll = update.find_game_files(tmp_path)
    assert pck == tmp_path / "SlayTheSpire2.pck"
    assert dll == tmp_path / "data_sts2_windows_x86_64" / "sts2.dll"


def test_game_file_lookup_still_finds_the_old_name(update, tmp_path):
    (tmp_path / "sts2.pck").write_bytes(b"x")
    assert update.find_game_files(tmp_path)[0] == tmp_path / "sts2.pck"
