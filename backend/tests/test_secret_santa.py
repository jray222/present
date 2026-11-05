import pytest
from app.services.secret_santa import solve_secret_santa

def test_secret_santa_solver_permutations():
    participants = [
        {"id": "p1", "name": "Mom"},
        {"id": "p2", "name": "Dad"},
        {"id": "p3", "name": "Son"},
        {"id": "p4", "name": "Daughter"},
    ]
    # Spouses cannot draw each other: Mom <-> Dad
    exclusions = {
        "p1": ["p2"],
        "p2": ["p1"],
    }

    pairs = solve_secret_santa(participants, exclusions)
    assert len(pairs) == 4

    givers = {p[0]["id"] for p in pairs}
    receivers = {p[1]["id"] for p in pairs}
    assert givers == {"p1", "p2", "p3", "p4"}
    assert receivers == {"p1", "p2", "p3", "p4"}

    for giver, receiver in pairs:
        # No one gives to themselves
        assert giver["id"] != receiver["id"]
        # Exclusions honored
        if giver["id"] == "p1":
            assert receiver["id"] != "p2"
        if giver["id"] == "p2":
            assert receiver["id"] != "p1"

def test_secret_santa_solver_impossible_constraints():
    # Only 2 participants and they exclude each other -> impossible draw
    participants = [
        {"id": "A", "name": "Alice"},
        {"id": "B", "name": "Bob"},
    ]
    exclusions = {"A": ["B"]}
    with pytest.raises(ValueError, match="Could not find a valid Secret Santa assignment"):
        solve_secret_santa(participants, exclusions)

def test_secret_santa_solver_too_few_participants():
    with pytest.raises(ValueError, match="requires at least 2 participants"):
        solve_secret_santa([{"id": "lone", "name": "Solo"}])

def test_secret_santa_api_flow(client):
    reg = client.post("/api/auth/register", json={"username": "santa_host", "password": "Password123!"})
    token = reg.json()["access_token"]

    grp = client.post("/api/groups", json={"name": "Christmas Crew"}, headers={"Authorization": f"Bearer {token}"}).json()

    draw_res = client.post(
        "/api/secret-santa",
        json={
            "group_id": grp["id"],
            "title": "Holiday 2026 Exchange",
            "budget_limit": 50.0,
            "exchange_date": "2026-12-25",
            "participants": ["Alice", "Bob", "Charlie", "Diana"],
            "exclusions": {"Alice": ["Bob"]},
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert draw_res.status_code == 200
    pairs = draw_res.json()
    assert len(pairs) == 4

    # Reveal envelope for one pair
    first_token = pairs[0]["view_token"]
    reveal_res = client.get(f"/api/secret-santa/reveal/{first_token}")
    assert reveal_res.status_code == 200
    data = reveal_res.json()
    assert data["title"] == "Holiday 2026 Exchange"
    assert data["giver_name"] == pairs[0]["giver_name"]
    assert data["receiver_name"] == pairs[0]["receiver_name"]
