from app.services import beta_diff


def test_diff_covers_characters_and_acts():
    assert {"characters", "acts"} <= set(beta_diff._ENTITY_LOADERS)


def test_diff_type_reports_added_changed_removed():
    stable = [{"id": "A", "hp": 1, "image_url": "x"}, {"id": "B", "hp": 2}]
    beta = [{"id": "A", "hp": 1, "image_url": "y"}, {"id": "C", "hp": 3}]
    out = beta_diff._diff_type(stable, beta)
    assert out == {"added": ["C"], "changed": {}, "removed": ["B"]}
    beta[0]["hp"] = 5
    assert beta_diff._diff_type(stable, beta)["changed"] == {"A": ["hp"]}


def _card(**over):
    base = {
        "id": "PECK",
        "description": "Deal 2 damage 3 times.",
        "hit_count": 3,
        "vars": {"Damage": 2, "Repeat": 3},
        "upgrade": {"repeat": "+1"},
        "description_raw": "Deal {Damage} damage {Repeat} times.",
    }
    return {**base, **over}


def test_renamed_hit_count_var_is_not_a_change():
    beta = _card(
        vars={"Damage": 2, "HitCount": 3},
        upgrade={"hitcount": "+1"},
        description_raw="Deal {Damage} damage {HitCount} times.",
    )
    assert beta_diff._diff_type([_card()], [beta])["changed"] == {}


def test_hit_count_only_one_side_could_read_is_not_a_change():
    beta = _card(hit_count=None, vars={"Damage": 2, "HitCount": 3})
    assert beta_diff._diff_type([_card()], [beta])["changed"] == {}


def test_real_hit_count_change_is_reported():
    beta = _card(
        description="Deal 2 damage 4 times.",
        hit_count=4,
        vars={"Damage": 2, "HitCount": 4},
    )
    changed = beta_diff._diff_type([_card()], [beta])["changed"]
    assert changed == {"PECK": ["description", "hit_count"]}
