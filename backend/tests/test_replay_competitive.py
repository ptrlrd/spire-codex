"""The site's competitive verdict: rebuilt from the replay rows and the
stored run, never taken from the replay's own claim."""

import gzip
import json

from app.services import replay_competitive

RUN = {"game_mode": "standard", "ascension": 10, "player_count": 1}
MODS = [{"t": "m", "id": "SpireCodex"}, {"t": "m", "id": "BaseLib"}]


def _header(**patch):
    row = {
        "t": "header",
        "competitive": True,
        "modifiers": [],
        "mods": MODS,
        "reloads": 0,
    }
    row.update(patch)
    return row


def _judge(rows, run=RUN, blob=None):
    body = "\n".join(json.dumps(r, separators=(",", ":")) for r in rows) + "\n"
    return replay_competitive.judge(gzip.compress(body.encode("utf-8")), run, blob)


def _end(reason="death", **extra):
    return {"t": "end", "terminal_reason": reason, **extra}


def test_a_replay_without_competitive_mode_gets_no_verdict():
    assert _judge([_header(competitive=False), _end()]) is None


def test_a_clean_a10_solo_run_is_cleared():
    verdict = _judge([_header(), _end()])
    assert verdict["state"] == "cleared"
    assert verdict["bracket"] == "a10_solo"
    assert verdict["reasons"] == []


def test_dread_solo_is_its_own_bracket():
    run = {"game_mode": "dread", "ascension": 3, "player_count": 1}
    assert _judge([_header(), _end()], run)["bracket"] == "dread_solo"


def test_the_bracket_comes_from_the_stored_run_not_the_header():
    run = {"game_mode": "standard", "ascension": 5, "player_count": 1}
    verdict = _judge([_header(competitive_bracket="a10_solo"), _end()], run)
    assert verdict["state"] == "flagged"
    assert verdict["bracket"] is None
    assert verdict["reasons"] == ["bracket"]


def test_modifiers_and_co_op_are_outside_the_brackets():
    assert _judge([_header(), _end()], RUN, {"modifiers": ["X"]})["reasons"] == [
        "bracket"
    ]
    co_op = {**RUN, "player_count": 2}
    assert _judge([_header(), _end()], co_op)["reasons"] == ["bracket"]


def test_another_mod_in_any_header_flags_the_run():
    rows = [
        _header(),
        _header(mods=MODS + [{"t": "m", "id": "SpireOracle"}], reloads=1),
        _end(),
    ]
    verdict = _judge(rows)
    assert verdict["reasons"] == ["mods"]
    assert verdict["mods"] == ["SpireOracle"]


def test_a_debug_command_flags_but_a_harmless_one_does_not():
    assert _judge([_header(), {"t": "console", "cmd": "help"}, _end()])["state"] == (
        "cleared"
    )
    verdict = _judge([_header(), {"t": "console", "cmd": "Gold", "args": ["100"]}])
    assert verdict["reasons"] == ["console"]
    assert verdict["commands"] == ["gold"]


def test_a_flag_the_mod_raised_is_kept_and_unknown_ones_are_folded():
    assert _judge([_header(competitive_flag="reload"), _end()])["reasons"] == ["reload"]
    rows = [_header(), {"t": "competitive", "flag": "<script>"}, _end()]
    assert _judge(rows)["reasons"] == ["client"]


def test_quitting_mid_fight_is_a_reload():
    fight = {"t": "combat_start", "combat_id": "c1"}
    assert _judge([_header(), fight, _end("left_run")])["reasons"] == ["reload"]
    clean = _end("interrupted", exit="clean")
    assert _judge([_header(), fight, clean])["reasons"] == ["reload"]
    marked = [_header(), fight, {"t": "competitive", "event": "quit"}]
    assert _judge(marked + [_end("interrupted", exit="crash")])["reasons"] == ["reload"]


def test_one_crash_mid_fight_is_forgiven_and_counted():
    fight = {"t": "combat_start", "combat_id": "c1"}
    crash = _end("interrupted", exit="crash")
    verdict = _judge([_header(), fight, crash, _header(reloads=1), _end()])
    assert verdict["state"] == "cleared"
    assert verdict["crash_recoveries"] == 1


def test_a_second_force_close_mid_fight_flags_the_run():
    fight = {"t": "combat_start", "combat_id": "c1"}
    killed = _end("interrupted", exit="killed")
    once = [_header(), fight, killed, _header(reloads=1)]
    assert _judge(once + [_end()])["state"] == "cleared"
    twice = once + [fight, killed, _header(reloads=2), _end()]
    verdict = _judge(twice)
    assert verdict["reasons"] == ["killed"]
    assert verdict["unexplained_exits"] == 2


def test_turning_the_mode_on_late_or_off_midway_flags_the_run():
    late = [_header(competitive=False), _header(reloads=1), _end()]
    assert _judge(late)["reasons"] == ["late"]
    off = [_header(), _header(competitive=False, reloads=1), _end()]
    assert _judge(off)["reasons"] == ["toggled"]


def test_an_older_save_or_a_finished_fight_coming_back_is_a_rollback():
    older = [_header(reloads=0), _header(reloads=2), _header(reloads=1), _end()]
    assert _judge(older)["reasons"] == ["rollback"]
    again = [
        _header(),
        {"t": "combat_start", "combat_id": "c1"},
        {"t": "combat_end", "combat_id": "c1"},
        _header(reloads=1),
        {"t": "resume", "reloads": 1, "combat_id": "c1"},
        _end(),
    ]
    assert _judge(again)["reasons"] == ["rollback"]


def test_a_replay_that_starts_partway_through_is_a_gap():
    assert _judge([_header(reloads=2), _end()])["reasons"] == ["gap"]


def test_every_reason_is_reported_not_just_the_first():
    rows = [
        _header(mods=MODS + [{"t": "m", "id": "Cheats"}]),
        {"t": "console", "cmd": "gold"},
        _end(),
    ]
    assert _judge(rows)["reasons"] == ["mods", "console"]


def test_quitting_between_rooms_flags_the_run():
    fight = [
        {"t": "combat_start", "combat_id": "c1"},
        {"t": "combat_end", "combat_id": "c1"},
    ]
    left = [_header()] + fight + [_end("left_run"), _header(reloads=1), _end()]
    assert _judge(left)["reasons"] == ["quit"]
    closed = [_header()] + fight + [_end("interrupted", exit="clean")]
    assert _judge(closed)["reasons"] == ["quit"]
    crashed = [_header()] + fight + [_end("interrupted", exit="crash")]
    assert _judge(crashed + [_header(reloads=1), _end()])["state"] == "cleared"


def test_no_mod_is_approved_until_the_list_names_it(monkeypatch):
    cosmetic = {"t": "m", "id": "PrettyCards", "affects_gameplay": False}
    rows = [_header(mods=MODS + [cosmetic]), _end()]
    assert replay_competitive.approved_mods() == []
    assert _judge(rows)["reasons"] == ["mods"]
    monkeypatch.setenv("COMPETITIVE_APPROVED_MODS", "prettycards, Other")
    assert replay_competitive.approved_mods() == ["Other", "prettycards"]
    assert _judge(rows)["state"] == "cleared"


def test_the_mod_is_told_the_approved_list(monkeypatch):
    from app.routers import mod_meta

    assert mod_meta.latest_mod_version()["competitive_approved_mods"] == []
    monkeypatch.setenv("COMPETITIVE_APPROVED_MODS", "PrettyCards")
    assert mod_meta.latest_mod_version()["competitive_approved_mods"] == ["PrettyCards"]
