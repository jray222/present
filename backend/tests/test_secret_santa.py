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

    # List draws: should include pairs with links, names, participants, and exclusions
    list_res = client.get("/api/secret-santa", headers={"Authorization": f"Bearer {token}"})
    assert list_res.status_code == 200
    draws = list_res.json()
    assert len(draws) == 1
    draw = draws[0]
    assert draw["title"] == "Holiday 2026 Exchange"
    assert draw["participants"] == ["Alice", "Bob", "Charlie", "Diana"]
    assert draw["exclusions"] == {"Alice": ["Bob"]}
    assert len(draw["pairs"]) == 4
    assert draw["pairs"][0]["giver_name"] == pairs[0]["giver_name"]
    assert draw["pairs"][0]["receiver_name"] == pairs[0]["receiver_name"]
    assert "/santa/view/" in draw["pairs"][0]["view_url"]
    assert draw["pairs"][0]["viewed_at"] is not None

    # Edit & re-run the draw
    draw_id = draw["id"]
    update_res = client.put(
        f"/api/secret-santa/{draw_id}",
        json={
            "title": "Holiday 2026 Exchange (Updated)",
            "budget_limit": 75.0,
            "exchange_date": "2026-12-24",
            "participants": ["Alice", "Bob", "Charlie", "Diana", "Eve"],
            "exclusions": {"Alice": ["Bob"], "Bob": ["Alice"]},
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["title"] == "Holiday 2026 Exchange (Updated)"
    assert updated["budget_limit"] == 75.0
    assert updated["exchange_date"] == "2026-12-24"
    assert updated["participants"] == ["Alice", "Bob", "Charlie", "Diana", "Eve"]
    assert updated["exclusions"] == {"Alice": ["Bob"], "Bob": ["Alice"]}
    assert len(updated["pairs"]) == 5
    for p in updated["pairs"]:
        assert p["giver_name"] != p["receiver_name"]
        if p["giver_name"] == "Alice":
            assert p["receiver_name"] != "Bob"
        if p["giver_name"] == "Bob":
            assert p["receiver_name"] != "Alice"
        assert "/santa/view/" in p["view_url"]

    # Quick redraw with saved participants & exclusions
    redraw_res = client.post(
        f"/api/secret-santa/{draw_id}/redraw",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert redraw_res.status_code == 200
    redrawn = redraw_res.json()
    assert len(redrawn["pairs"]) == 5

    # Delete draw
    del_res = client.delete(
        f"/api/secret-santa/{draw_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_res.status_code == 200
    after_del = client.get("/api/secret-santa", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(after_del) == 0
