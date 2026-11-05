import pytest

def test_guest_magic_link_claim_flow(client):
    # Setup owner and wishlist
    reg = client.post("/api/auth/register", json={"username": "parent", "password": "Password123!"})
    token = reg.json()["access_token"]

    wl = client.post("/api/wishlists", json={"title": "Kids Wishlist"}, headers={"Authorization": f"Bearer {token}"}).json()
    item = client.post(f"/api/wishlists/{wl['id']}/items", json={"title": "Lego Set", "price": 49.99}, headers={"Authorization": f"Bearer {token}"}).json()

    # Create share token for grandparent
    share = client.post(f"/api/wishlists/{wl['id']}/share-token", headers={"Authorization": f"Bearer {token}"}).json()
    share_token = share["token"]

    # Grandparent views list via magic token route
    guest_view = client.get(f"/api/wishlists/shared-token/{share_token}")
    assert guest_view.status_code == 200
    assert len(guest_view.json()["items"]) == 1

    # Grandparent claims item as guest without an account
    claim_res = client.post(
        f"/api/claims/items/{item['id']}",
        json={"status": "reserved", "guest_name": "Grandma Helen"}
    )
    assert claim_res.status_code == 200
    assert claim_res.json()["is_claimed"] is True
    assert claim_res.json()["claims"][0]["claimed_by_name"] == "Grandma Helen"

    # Another guest tries to claim the same item -> 409 Conflict
    conflict_res = client.post(
        f"/api/claims/items/{item['id']}",
        json={"status": "reserved", "guest_name": "Uncle Bob"}
    )
    assert conflict_res.status_code == 409
    assert "Grandma Helen" in conflict_res.json()["detail"]

    # Grandma marks it as purchased
    purchase_res = client.post(
        f"/api/claims/items/{item['id']}",
        json={"status": "purchased", "guest_name": "Grandma Helen"}
    )
    assert purchase_res.status_code == 200
    assert purchase_res.json()["claims"][0]["status"] == "purchased"

    # Grandma releases her claim
    release_res = client.delete(f"/api/claims/items/{item['id']}?guest_name=Grandma Helen")
    assert release_res.status_code == 200
    assert release_res.json()["is_claimed"] is False
