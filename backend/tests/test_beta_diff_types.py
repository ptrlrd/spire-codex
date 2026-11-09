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
