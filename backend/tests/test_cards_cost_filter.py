"""starany keeps every card with a star cost, X star costs included."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_starany_returns_every_star_cost_card():
    cards = client.get("/api/cards?cost=starany").json()
    assert len(cards) >= 20
    assert all(c["star_cost"] is not None or c["is_x_star_cost"] for c in cards)
    assert any(c["is_x_star_cost"] for c in cards)
    assert {c["id"] for c in client.get("/api/cards?cost=star3").json()} <= {
        c["id"] for c in cards
    }
