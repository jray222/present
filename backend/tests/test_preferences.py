import pytest


def _register(client, username, full_name=None):
    payload = {"username": username, "password": "Password123!"}
    if full_name:
        payload["full_name"] = full_name
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200
    data = res.json()
    return data["access_token"], data["user"]


def test_preference_categories_match_expected(client):
    res = client.get("/api/preferences/categories")
    assert res.status_code == 200
    labels = [c["label"] for c in res.json()]
    assert labels == [
        "Coffee, Tea, Hot chocolate",
        "Beauty, Healthcare",
        "Sweet Treats",
        "Alcohol",
        "Snacks, Condiments",
        "Candles, Scents, Diffusers",
    ]


def test_own_and_managed_profile_preferences_crud_and_validation(client):
    token_kelly, kelly = _register(client, "kelly_pref", "Kelly")

    # Initially empty
    me_res = client.get("/api/preferences/me", headers={"Authorization": f"Bearer {token_kelly}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["is_self"] is True
    assert me_data["is_editable"] is True
    assert me_data["preferences"]["has_preferences"] is False
    assert me_data["preferences"]["filled_count"] == 0

    # Save preferences (unknown keys ignored, whitespace trimmed)
    save_res = client.put(
        "/api/preferences/me",
        json={
            "categories": {
                "coffee_tea_hot_chocolate": "  Medium roast coffee, Earl Grey tea  ",
                "sweet_treats": "Dark chocolate with sea salt",
                "alcohol": "Dry Pinot Noir",
                "candles_scents_diffusers": "Cedarwood & balsam fir",
                "unknown_key": "should be ignored",
            },
            "notes": "No peanuts please!",
        },
        headers={"Authorization": f"Bearer {token_kelly}"},
    )
    assert save_res.status_code == 200
    saved = save_res.json()["preferences"]
    assert saved["has_preferences"] is True
    assert saved["filled_count"] == 4
    assert saved["categories"]["coffee_tea_hot_chocolate"] == "Medium roast coffee, Earl Grey tea"
    assert saved["categories"]["sweet_treats"] == "Dark chocolate with sea salt"
    assert saved["categories"]["beauty_healthcare"] == ""
    assert "unknown_key" not in saved["categories"]
    assert saved["notes"] == "No peanuts please!"
    assert saved["updated_at"] is not None

    # Reject overly long preference value
    too_long = client.put(
        "/api/preferences/me",
        json={"categories": {"sweet_treats": "x" * 1001}},
        headers={"Authorization": f"Bearer {token_kelly}"},
    )
    assert too_long.status_code == 400

    # Managed profile (child) preferences
    child = client.post(
        "/api/profiles",
        json={"name": "Maya", "avatar_emoji": "🌟"},
        headers={"Authorization": f"Bearer {token_kelly}"},
    ).json()

    child_put = client.put(
        f"/api/preferences/profiles/{child['id']}",
        json={
            "categories": {
                "coffee_tea_hot_chocolate": "Peppermint hot chocolate",
                "sweet_treats": "Gummy bears",
                "snacks_condiments": "Kettle corn",
            },
            "notes": "Loves stickers too",
        },
        headers={"Authorization": f"Bearer {token_kelly}"},
    )
    assert child_put.status_code == 200
    child_data = child_put.json()
    assert child_data["person_type"] == "managed_profile"
    assert child_data["name"] == "Maya"
    assert child_data["preferences"]["filled_count"] == 3
    assert child_data["preferences"]["categories"]["coffee_tea_hot_chocolate"] == "Peppermint hot chocolate"


def test_family_tenancy_and_access_control(client):
    token_a, user_a = _register(client, "alice_pref", "Alice")
    token_b, user_b = _register(client, "bob_pref", "Bob")
    token_eve, user_eve = _register(client, "eve_pref", "Eve")

    # Alice saves her preferences and creates a child with preferences
    client.put(
        "/api/preferences/me",
        json={"categories": {"snacks_condiments": "Spicy salsa & olive oil"}},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    child = client.post(
        "/api/profiles",
        json={"name": "Leo"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    client.put(
        f"/api/preferences/profiles/{child['id']}",
        json={"categories": {"sweet_treats": "Oreos"}},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    # Create group and add Bob (NOT Eve)
    grp = client.post(
        "/api/groups",
        json={"name": "Thanksgiving Crew"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    client.post(
        "/api/groups/join",
        json={"invite_code": grp["invite_code"]},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    # Bob can view Alice's and Leo's preferences
    res_b_alice = client.get(
        f"/api/preferences/users/{user_a['id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_alice.status_code == 200
    assert res_b_alice.json()["is_editable"] is False
    assert res_b_alice.json()["preferences"]["categories"]["snacks_condiments"] == "Spicy salsa & olive oil"

    res_b_child = client.get(
        f"/api/preferences/profiles/{child['id']}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_child.status_code == 200
    assert res_b_child.json()["is_editable"] is False
    assert res_b_child.json()["preferences"]["categories"]["sweet_treats"] == "Oreos"

    # Bob CANNOT edit Leo's preferences
    res_b_edit_child = client.put(
        f"/api/preferences/profiles/{child['id']}",
        json={"categories": {"sweet_treats": "Hacked"}},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_edit_child.status_code == 403

    # Bob's /family preferences list includes Bob, Alice, and Leo (NOT Eve)
    fam_b = client.get("/api/preferences/family", headers={"Authorization": f"Bearer {token_b}"}).json()
    fam_names = [p["name"] for p in fam_b]
    assert "Bob" in fam_names
    assert "Alice" in fam_names
    assert "Leo" in fam_names
    assert "Eve" not in fam_names

    # Eve (outsider) is blocked from Alice's and Leo's preferences
    assert (
        client.get(
            f"/api/preferences/users/{user_a['id']}",
            headers={"Authorization": f"Bearer {token_eve}"},
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/preferences/profiles/{child['id']}",
            headers={"Authorization": f"Bearer {token_eve}"},
        ).status_code
        == 403
    )


def test_preferences_exposed_on_wishlists_and_secret_santa_reveal(client):
    token_a, user_a = _register(client, "kelly_xmas", "Kelly")
    token_b, user_b = _register(client, "dave_xmas", "Dave")
    token_outsider, _ = _register(client, "outsider_xmas", "Dave")

    # Outsider named "Dave" sets secret preferences outside the group
    client.put(
        "/api/preferences/me",
        json={"categories": {"alcohol": "OUTSIDER SECRET"}},
        headers={"Authorization": f"Bearer {token_outsider}"},
    )

    # Group member Kelly sets preferences
    client.put(
        "/api/preferences/me",
        json={
            "categories": {
                "coffee_tea_hot_chocolate": "Chai latte mix",
                "beauty_healthcare": "Lavender hand cream",
            }
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )

    # Group member Dave sets preferences
    client.put(
        "/api/preferences/me",
        json={"categories": {"alcohol": "Single malt scotch"}},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    grp = client.post(
        "/api/groups",
        json={"name": "Kelly Family"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    client.post(
        "/api/groups/join",
        json={"invite_code": grp["invite_code"]},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    # Wishlist & Grandparent share token include owner_preferences
    wl = client.post(
        "/api/wishlists",
        json={"title": "Kelly Christmas 2026"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    assert wl["owner_preferences"]["categories"]["coffee_tea_hot_chocolate"] == "Chai latte mix"

    share_token = client.post(
        f"/api/wishlists/{wl['id']}/share-token",
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["token"]
    shared_wl = client.get(f"/api/wishlists/shared-token/{share_token}").json()
    assert shared_wl["owner_preferences"]["categories"]["beauty_healthcare"] == "Lavender hand cream"

    # Secret Santa draw in Kelly Family group with Kelly and Dave
    pairs = client.post(
        "/api/secret-santa",
        json={
            "group_id": grp["id"],
            "title": "Christmas Consumables Exchange",
            "budget_limit": 100.0,
            "participants": ["Kelly", "Dave"],
        },
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()
    assert len(pairs) == 2

    # Reveal each envelope and verify receiver preferences match group member only
    for pair in pairs:
        reveal = client.get(f"/api/secret-santa/reveal/{pair['view_token']}").json()
        assert reveal["receiver_preferences"] is not None
        if reveal["receiver_name"] == "Dave":
            assert reveal["receiver_preferences"]["categories"]["alcohol"] == "Single malt scotch"
            assert "OUTSIDER SECRET" not in str(reveal["receiver_preferences"])
        elif reveal["receiver_name"] == "Kelly":
            assert reveal["receiver_preferences"]["categories"]["coffee_tea_hot_chocolate"] == "Chai latte mix"


def test_non_user_family_members_gift_conflicts_and_privacy(client):
    token, _ = _register(client, "organizer_conflicts", "Kelly")

    # Reject blank profile name
    assert client.post(
        "/api/profiles",
        json={"name": "   "},
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 400

    # Add non-user family members (Grandma, Uncle Dave) and rename one
    grandma = client.post(
        "/api/profiles",
        json={"name": "Grandma", "avatar_emoji": "👵"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    dave = client.post(
        "/api/profiles",
        json={"name": "Dave", "avatar_emoji": "👨"},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    renamed = client.patch(
        f"/api/profiles/{dave['id']}",
        json={"name": "Uncle Dave", "avatar_emoji": "🎅"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Uncle Dave"
    assert renamed.json()["avatar_emoji"] == "🎅"

    # Save preferences + conflicts for Kelly and non-user Grandma (with duplicates/whitespace)
    kelly_saved = client.put(
        "/api/preferences/me",
        json={
            "categories": {"coffee_tea_hot_chocolate": "Chai tea"},
            "conflicts": [" Uncle Dave ", "uncle dave", ""],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert kelly_saved.status_code == 200
    assert kelly_saved.json()["preferences"]["conflicts"] == ["Uncle Dave"]

    grandma_saved = client.put(
        f"/api/preferences/profiles/{grandma['id']}",
        json={
            "categories": {"sweet_treats": "Peppermint bark"},
            "conflicts": ["Kelly"],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert grandma_saved.status_code == 200
    assert grandma_saved.json()["preferences"]["conflicts"] == ["Kelly"]

    # /api/preferences/family returns conflicts for both user and non-user profiles
    fam = client.get("/api/preferences/family", headers={"Authorization": f"Bearer {token}"}).json()
    by_name = {p["name"]: p for p in fam}
    assert by_name["Kelly"]["preferences"]["conflicts"] == ["Uncle Dave"]
    assert by_name["Grandma"]["preferences"]["conflicts"] == ["Kelly"]
    assert "Uncle Dave" in by_name

    # Wishlist share token MUST NOT expose Secret Santa conflicts
    wl = client.post(
        "/api/wishlists",
        json={"title": "Grandma List", "managed_profile_id": grandma["id"]},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    share_tok = client.post(
        f"/api/wishlists/{wl['id']}/share-token",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["token"]
    shared = client.get(f"/api/wishlists/shared-token/{share_tok}").json()
    assert shared["owner_preferences"]["categories"]["sweet_treats"] == "Peppermint bark"
    assert shared["owner_preferences"]["conflicts"] == []

    # Secret Santa draw with non-user Grandma reveals Grandma's preferences but NOT her conflicts
    pairs = client.post(
        "/api/secret-santa",
        json={
            "title": "Family Draw",
            "participants": ["Kelly", "Grandma", "Uncle Dave"],
            "exclusions": {"Kelly": ["Uncle Dave"], "Grandma": ["Kelly"]},
        },
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    for p in pairs:
        rev = client.get(f"/api/secret-santa/reveal/{p['view_token']}").json()
        if rev["receiver_name"] == "Grandma":
            assert rev["receiver_preferences"]["categories"]["sweet_treats"] == "Peppermint bark"
            assert rev["receiver_preferences"]["conflicts"] == []

