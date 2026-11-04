import pytest
from app.services.scraper import scrape_product_url, clean_product_url

@pytest.mark.asyncio
async def test_scraper_fallback():
    # Test invalid / empty url graceful fallback
    res = await scrape_product_url("")
    assert res["title"] == ""
    assert res["price"] is None

def test_clean_product_url():
    u1 = "https://www.amazon.com/gp/aw/d/B0B28G5Y4R/ref=ox_sc_act_title_1?smid=A2H94G4J68N9IJ&psc=1"
    assert clean_product_url(u1) == "https://www.amazon.com/dp/B0B28G5Y4R"
    u2 = "https://www.amazon.com/HAPPRUN-Native-1080P-Outdoor-Projector-Standard/dp/B0B28G5Y4R"
    assert clean_product_url(u2) == "https://www.amazon.com/dp/B0B28G5Y4R"

def test_claims_lockout_duplicate_check(client):
    # Setup users
    client.post("/api/auth/register", json={"username": "giver1", "password": "Password123!"})
    t1 = client.post("/api/auth/login", json={"username": "giver1", "password": "Password123!"}).json()["access_token"]

    client.post("/api/auth/register", json={"username": "giver2", "password": "Password123!"})
    t2 = client.post("/api/auth/login", json={"username": "giver2", "password": "Password123!"}).json()["access_token"]

    client.post("/api/auth/register", json={"username": "kid", "password": "Password123!"})
    tkid = client.post("/api/auth/login", json={"username": "kid", "password": "Password123!"}).json()["access_token"]

    # Kid makes list
    wl = client.post("/api/wishlists", json={"title": "Kids Toys"}, headers={"Authorization": f"Bearer {tkid}"}).json()
    item = client.post(f"/api/wishlists/{wl['id']}/items", json={"title": "Toy Car", "price": 10.0}, headers={"Authorization": f"Bearer {tkid}"}).json()

    # Giver1 reserves item
    res = client.post(f"/api/claims/items/{item['id']}", json={"status": "reserved"}, headers={"Authorization": f"Bearer {t1}"})
    assert res.status_code == 200

    # Giver2 tries to reserve same item -> 409 Conflict lockout!
    res2 = client.post(f"/api/claims/items/{item['id']}", json={"status": "reserved"}, headers={"Authorization": f"Bearer {t2}"})
    assert res2.status_code == 409
    assert "already been" in res2.json()["detail"]

def test_batch_claim_items(client):
    client.post("/api/auth/register", json={"username": "batch_buyer", "password": "Password123!"})
    t_buyer = client.post("/api/auth/login", json={"username": "batch_buyer", "password": "Password123!"}).json()["access_token"]

    client.post("/api/auth/register", json={"username": "kid2", "password": "Password123!"})
    tkid2 = client.post("/api/auth/login", json={"username": "kid2", "password": "Password123!"}).json()["access_token"]

    wl = client.post("/api/wishlists", json={"title": "Birthday Wishlist"}, headers={"Authorization": f"Bearer {tkid2}"}).json()
    item1 = client.post(f"/api/wishlists/{wl['id']}/items", json={"title": "Item 1", "price": 15.0}, headers={"Authorization": f"Bearer {tkid2}"}).json()
    item2 = client.post(f"/api/wishlists/{wl['id']}/items", json={"title": "Item 2", "price": 25.0}, headers={"Authorization": f"Bearer {tkid2}"}).json()

    # Batch reserve items
    batch_res = client.post(
        "/api/claims/batch",
        json={"item_ids": [item1["id"], item2["id"]], "status": "reserved"},
        headers={"Authorization": f"Bearer {t_buyer}"}
    )
    assert batch_res.status_code == 200
    data = batch_res.json()
    assert data["count"] == 2
    assert len(data["updated_items"]) == 2

