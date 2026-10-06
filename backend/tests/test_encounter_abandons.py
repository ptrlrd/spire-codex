"""An abandon in a fight counts as abandoned at that encounter, never as a
death, and rollup still reads stores written before the abandoned column."""

from app.services import encounter_stats as es


def _blob():
    return {
        "map_point_history": [
            [
                {
                    "rooms": [
                        {
                            "room_type": "elite",
                            "model_id": "ENCOUNTER.PHROG_PARASITE_ELITE",
                            "turns_taken": 4,
                        }
                    ],
                    "player_stats": [{"damage_taken": 12}],
                }
            ]
        ]
    }


def _run(acc, *, abandoned):
    es.accumulate(
        acc,
        _blob(),
        brackets=["all"],
        character="IRONCLAD",
        is_win=False,
        player_count=1,
        killed_by="PHROG_PARASITE_ELITE",
        is_abandoned=abandoned,
    )


def test_abandon_counts_apart_from_deaths():
    acc = es.new_accumulator()
    _run(acc, abandoned=False)
    _run(acc, abandoned=True)
    _run(acc, abandoned=True)
    row = es.rollup(es.finalize(acc)["all"])["encounters"][0]
    assert (row["total"], row["fatal"], row["abandoned"]) == (3, 1, 2)
    ch = row["characters"][0]
    assert (ch["fatal"], ch["abandoned"]) == (1, 2)


def test_rollup_reads_cells_without_the_abandoned_column(monkeypatch):
    monkeypatch.setattr(es, "_official_encounter_ids", lambda: frozenset())
    old = {
        "version": es.ENCOUNTER_VERSION,
        "cells": [["JAW_WORM", 1, "monster", "IRONCLAD", "solo", 10, 2, 50.0, 30.0]],
    }
    row = es.rollup(old)["encounters"][0]
    assert (row["total"], row["fatal"], row["abandoned"]) == (10, 2, 0)
