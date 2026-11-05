def test_register_and_login(client):
    reg = client.post("/api/auth/register", json={
        "username": "sarah",
        "password": "Password123!",
        "full_name": "Sarah Miller",
    })
    assert reg.status_code == 200
    data = reg.json()
    assert "access_token" in data
    assert data["user"]["username"] == "sarah"

    # Login
    login = client.post("/api/auth/login", json={
        "username": "sarah",
        "password": "Password123!",
    })
    assert login.status_code == 200
    assert "access_token" in login.json()

def test_secret_santa_solver():
    from app.services.secret_santa import solve_secret_santa
    participants = [{"id": "A", "name": "Alice"}, {"id": "B", "name": "Bob"}, {"id": "C", "name": "Charlie"}]
    pairs = solve_secret_santa(participants, {"A": ["B"]})
    assert len(pairs) == 3
    # Check no one draws self
    for g, r in pairs:
        assert g["id"] != r["id"]
        if g["id"] == "A":
            assert r["id"] != "B"

def test_secret_claims_anti_spoiler(client):
    # Register User A (Alice)
    res_a = client.post("/api/auth/register", json={"username": "alice", "password": "Password123!"})
    token_a = res_a.json()["access_token"]

    # Register User B (Bob)
    res_b = client.post("/api/auth/register", json={"username": "bob", "password": "Password123!"})
    token_b = res_b.json()["access_token"]

    # Alice creates wishlist & item
    wl = client.post("/api/wishlists", json={"title": "Christmas 2026"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    item = client.post(f"/api/wishlists/{wl['id']}/items", json={"title": "Warm Wool Socks", "price": 18.0}, headers={"Authorization": f"Bearer {token_a}"}).json()

    # Unauthenticated viewer should get 401
    assert client.get(f"/api/wishlists/{wl['id']}").status_code == 401

    # Bob (not in group yet) should get 403 Forbidden
    assert client.get(f"/api/wishlists/{wl['id']}", headers={"Authorization": f"Bearer {token_b}"}).status_code == 403

    # Alice creates a family group and Bob joins it
    grp = client.post("/api/groups", json={"name": "Miller Family"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    join_res = client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {token_b}"})
    assert join_res.status_code == 200

    # Bob reserves Alice's item
    claim = client.post(f"/api/claims/items/{item['id']}", json={"status": "reserved"}, headers={"Authorization": f"Bearer {token_b}"})
    assert claim.status_code == 200
    assert claim.json()["is_claimed"] == True
    assert claim.json()["claim_status"] == "reserved"

    # Now that Bob is in Alice's group, he can view the wishlist and sees it is reserved:
    bob_view = client.get(f"/api/wishlists/{wl['id']}", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert bob_view["items"][0]["is_claimed"] == True
    assert len(bob_view["items"][0]["claims"]) == 1

    # When Alice (recipient) looks at her own wishlist, anti-spoiler ensures claim is 100% hidden!
    alice_view = client.get(f"/api/wishlists/{wl['id']}", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert alice_view["items"][0]["is_claimed"] == False
    assert len(alice_view["items"][0]["claims"]) == 0
