import pytest

def test_wishlist_access_control_and_anti_spoiler(client):
    # 1. Register Owner (Alice) and Non-Group User (Eve)
    res_a = client.post("/api/auth/register", json={"username": "alice_acl", "password": "Password123!"})
    token_a = res_a.json()["access_token"]

    res_eve = client.post("/api/auth/register", json={"username": "eve_acl", "password": "Password123!"})
    token_eve = res_eve.json()["access_token"]

    # 2. Alice creates a wishlist with an item
    wl = client.post("/api/wishlists", json={"title": "Alice's Birthday"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    wl_id = wl["id"]
    item = client.post(f"/api/wishlists/{wl_id}/items", json={"title": "Board Game", "price": 40.0}, headers={"Authorization": f"Bearer {token_a}"}).json()
    item_id = item["id"]

    # 3. Unauthenticated access without token is blocked (401)
    res_unauth = client.get(f"/api/wishlists/{wl_id}")
    assert res_unauth.status_code == 401

    # 4. Authenticated user outside of Alice's group is blocked (403)
    res_eve_view = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_eve}"})
    assert res_eve_view.status_code == 403

    # 5. Alice creates a group and invites Bob
    res_b = client.post("/api/auth/register", json={"username": "bob_acl", "password": "Password123!"})
    token_b = res_b.json()["access_token"]

    grp = client.post("/api/groups", json={"name": "Alice & Bob Circle"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {token_b}"})

    # 6. Now Bob can view Alice's wishlist (200)
    res_b_view = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b_view.status_code == 200
    assert res_b_view.json()["title"] == "Alice's Birthday"

    # 7. Bob reserves Alice's gift
    claim_res = client.post(f"/api/claims/items/{item_id}", json={"status": "reserved"}, headers={"Authorization": f"Bearer {token_b}"})
    assert claim_res.status_code == 200

    # 8. Anti-spoiler verification:
    # Bob (family member) sees item is reserved:
    bob_view = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert bob_view["items"][0]["is_claimed"] is True
    assert len(bob_view["items"][0]["claims"]) == 1

    # Alice (recipient owner) NEVER sees the claim:
    alice_view = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert alice_view["items"][0]["is_claimed"] is False
    assert len(alice_view["items"][0]["claims"]) == 0

    # 9. Grandparent share token access
    token_res = client.post(f"/api/wishlists/{wl_id}/share-token", headers={"Authorization": f"Bearer {token_a}"}).json()
    share_token = token_res["token"]

    # Access via query param ?token=... works even unauthenticated
    guest_view = client.get(f"/api/wishlists/{wl_id}?token={share_token}")
    assert guest_view.status_code == 200
    assert guest_view.json()["title"] == "Alice's Birthday"
    # Guest sees the reservation made by Bob
    assert guest_view.json()["items"][0]["is_claimed"] is True

def test_wishlist_archiving_and_reordering(client):
    res = client.post("/api/auth/register", json={"username": "organizer", "password": "Password123!"})
    token = res.json()["access_token"]

    wl = client.post("/api/wishlists", json={"title": "Christmas 2025"}, headers={"Authorization": f"Bearer {token}"}).json()
    wl_id = wl["id"]

    item1 = client.post(f"/api/wishlists/{wl_id}/items", json={"title": "Item 1"}, headers={"Authorization": f"Bearer {token}"}).json()
    item2 = client.post(f"/api/wishlists/{wl_id}/items", json={"title": "Item 2"}, headers={"Authorization": f"Bearer {token}"}).json()
    item3 = client.post(f"/api/wishlists/{wl_id}/items", json={"title": "Item 3"}, headers={"Authorization": f"Bearer {token}"}).json()

    # Reorder items: item3, item1, item2
    reorder_res = client.post(
        f"/api/wishlists/{wl_id}/reorder",
        json={"item_ids": [item3["id"], item1["id"], item2["id"]]},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert reorder_res.status_code == 200
    assert reorder_res.json()["count"] == 3

    updated_wl = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token}"}).json()
    item_titles = [i["title"] for i in updated_wl["items"]]
    assert item_titles == ["Item 3", "Item 1", "Item 2"]

    # Archive list
    archive_res = client.patch(f"/api/wishlists/{wl_id}", json={"is_archived": True}, headers={"Authorization": f"Bearer {token}"})
    assert archive_res.status_code == 200
    assert archive_res.json()["is_archived"] is True

    # Active lists exclude archived by default
    active_lists = client.get("/api/wishlists", headers={"Authorization": f"Bearer {token}"}).json()
    assert all(w["id"] != wl_id for w in active_lists)

    # Active lists include archived when requested
    all_lists = client.get("/api/wishlists?include_archived=true", headers={"Authorization": f"Bearer {token}"}).json()
    assert any(w["id"] == wl_id for w in all_lists)

def test_purchase_reminder_flag(client, db):
    from datetime import datetime, timezone, timedelta
    from app.models import ItemClaim

    # Register users
    res_a = client.post("/api/auth/register", json={"username": "alice_rem", "password": "Password123!"})
    token_a = res_a.json()["access_token"]
    res_b = client.post("/api/auth/register", json={"username": "bob_rem", "password": "Password123!"})
    token_b = res_b.json()["access_token"]

    # Alice creates list and group
    wl = client.post("/api/wishlists", json={"title": "Alice Reminder List"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    wl_id = wl["id"]
    item = client.post(f"/api/wishlists/{wl_id}/items", json={"title": "Coffee Maker"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    item_id = item["id"]

    grp = client.post("/api/groups", json={"name": "Reminder Group"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {token_b}"})

    # Bob reserves the item
    client.post(f"/api/claims/items/{item_id}", json={"status": "reserved"}, headers={"Authorization": f"Bearer {token_b}"})

    # Fresh reservation: needs_purchase_reminder should be False
    res_fresh = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_b}"}).json()
    claim_fresh = res_fresh["items"][0]["claims"][0]
    assert claim_fresh["status"] == "reserved"
    assert claim_fresh["needs_purchase_reminder"] is False

    # Simulate 8 days elapsed on reservation
    claim_record = db.query(ItemClaim).filter(ItemClaim.item_id == item_id).first()
    claim_record.reserved_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.commit()

    # Bob views list: needs_purchase_reminder should be True
    res_stale = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_b}"}).json()
    claim_stale = res_stale["items"][0]["claims"][0]
    assert claim_stale["needs_purchase_reminder"] is True

    # Bob marks item as purchased: needs_purchase_reminder should be False
    client.post(f"/api/claims/items/{item_id}", json={"status": "purchased"}, headers={"Authorization": f"Bearer {token_b}"})
    res_purchased = client.get(f"/api/wishlists/{wl_id}", headers={"Authorization": f"Bearer {token_b}"}).json()
    claim_purchased = res_purchased["items"][0]["claims"][0]
    assert claim_purchased["status"] == "purchased"
    assert claim_purchased["needs_purchase_reminder"] is False
