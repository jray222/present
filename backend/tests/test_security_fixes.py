import pytest
import pyotp
from app.models import GroupMember, User
from app.services.rate_limiter import limiter
from app.config import settings


def _register(client, username, password="Password123!", full_name=None):
    payload = {"username": username, "password": password}
    if full_name:
        payload["full_name"] = full_name
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200
    return res.json()["access_token"], res.json()["user"], res.cookies.get("present_refresh_token")


def test_pre_2fa_temp_token_rejected_on_protected_endpoints(client):
    token, user, _ = _register(client, "mfa_strict_user")

    # Enroll 2FA
    setup = client.post("/api/settings/2fa/setup", headers={"Authorization": f"Bearer {token}"}).json()
    code = pyotp.TOTP(setup["secret"]).now()
    confirm = client.post(
        "/api/settings/2fa/confirm",
        json={"code": code},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert confirm.status_code == 200

    # Login returns 403 + 2FA challenge temp_token
    login_res = client.post("/api/auth/login", json={"username": "mfa_strict_user", "password": "Password123!"})
    assert login_res.status_code == 403
    temp_token = login_res.json()["detail"]["temp_token"]

    # temp_token MUST NOT work on protected endpoints
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {temp_token}"}).status_code == 401
    assert client.get("/api/preferences/me", headers={"Authorization": f"Bearer {temp_token}"}).status_code == 401

    # Regular access token MUST NOT be accepted as a 2FA challenge token
    bad_verify = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": token, "code": pyotp.TOTP(setup["secret"]).now()},
    )
    assert bad_verify.status_code == 401

    # Completing 2FA with the challenge token succeeds and yields a usable access token
    good_verify = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": temp_token, "code": pyotp.TOTP(setup["secret"]).now()},
    )
    assert good_verify.status_code == 200
    verified_token = good_verify.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {verified_token}"}).status_code == 200


def test_group_admin_cannot_reset_superuser_or_higher_role(client, db):
    # Ensure a superuser exists
    su_token, su_user, _ = _register(client, "super_victim")
    db_su = db.query(User).filter(User.id == su_user["id"]).first()
    db_su.is_superuser = True
    db.commit()

    # Regular user creates a group (becomes owner) and superuser joins it
    owner_token, owner_user, _ = _register(client, "group_owner_attacker")
    member_token, member_user, _ = _register(client, "regular_member")
    admin_token, admin_user, _ = _register(client, "group_admin_user")

    grp = client.post(
        "/api/groups",
        json={"name": "Shared Circle"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()
    for t in (su_token, member_token, admin_token):
        client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {t}"})

    # Promote admin_user to group admin
    gm_admin = db.query(GroupMember).filter(
        GroupMember.group_id == grp["id"],
        GroupMember.user_id == admin_user["id"],
    ).first()
    gm_admin.role = "admin"
    db.commit()

    # Non-superuser group owner CANNOT reset superuser 2FA or password
    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-2fa",
        json={"user_id": su_user["id"]},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 403
    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": su_user["id"], "new_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 403

    # Group admin CANNOT reset group owner
    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": owner_user["id"], "new_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).status_code == 403

    # Self-reset via group admin endpoint is rejected (400)
    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": owner_user["id"], "new_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 400

    # Short (<8 char) password is rejected (400)
    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": member_user["id"], "new_password": "short6"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 400

    # Legitimate reset of regular member by group owner succeeds
    ok_res = client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": member_user["id"], "new_password": "RescuedPass123!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert ok_res.status_code == 200


def test_secret_santa_enforces_draw_admin_role(client):
    owner_token, _, _ = _register(client, "ss_owner", full_name="Owner")
    member_token, _, _ = _register(client, "ss_member", full_name="Member")

    grp = client.post(
        "/api/groups",
        json={"name": "Santa Circle"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()
    client.post(
        "/api/groups/join",
        json={"invite_code": grp["invite_code"]},
        headers={"Authorization": f"Bearer {member_token}"},
    )

    # Regular member cannot create a draw inside a group they don't admin
    assert client.post(
        "/api/secret-santa",
        json={
            "group_id": grp["id"],
            "title": "Unauthorized Draw",
            "participants": ["Owner", "Member"],
        },
        headers={"Authorization": f"Bearer {member_token}"},
    ).status_code == 403

    # Owner creates a draw
    pairs = client.post(
        "/api/secret-santa",
        json={
            "group_id": grp["id"],
            "title": "Official Draw",
            "participants": ["Owner", "Member", "Guest1", "Guest2"],
            "exclusions": {"Owner": ["Member"]},
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()
    assert len(pairs) == 4

    owner_draws = client.get("/api/secret-santa", headers={"Authorization": f"Bearer {owner_token}"}).json()
    draw_id = owner_draws[0]["id"]
    assert owner_draws[0]["is_admin"] is True
    assert len(owner_draws[0]["pairs"]) == 4

    # Regular member sees draw metadata only — NO pairs, NO view_tokens, NO exclusions
    member_draws = client.get("/api/secret-santa", headers={"Authorization": f"Bearer {member_token}"}).json()
    assert len(member_draws) == 1
    assert member_draws[0]["is_admin"] is False
    assert member_draws[0]["pairs"] == []
    assert member_draws[0]["exclusions"] == {}

    member_get = client.get(f"/api/secret-santa/{draw_id}", headers={"Authorization": f"Bearer {member_token}"}).json()
    assert member_get["pairs"] == []

    # Regular member is blocked (403) from editing, redrawing, or deleting the draw
    assert client.put(
        f"/api/secret-santa/{draw_id}",
        json={"title": "Tampered", "participants": ["Owner", "Member"]},
        headers={"Authorization": f"Bearer {member_token}"},
    ).status_code == 403
    assert client.post(
        f"/api/secret-santa/{draw_id}/redraw",
        headers={"Authorization": f"Bearer {member_token}"},
    ).status_code == 403
    assert client.delete(
        f"/api/secret-santa/{draw_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    ).status_code == 403


def test_password_change_and_resets_invalidate_prior_sessions(client, db):
    # 1. Self password change invalidates prior session tokens and refresh cookies
    s1_token, user, s1_refresh = _register(client, "session_user", password="InitialPass123!")
    s2_res = client.post("/api/auth/login", json={"username": "session_user", "password": "InitialPass123!"})
    s2_token = s2_res.json()["access_token"]
    s2_refresh = s2_res.cookies.get("present_refresh_token")

    change_res = client.post(
        "/api/auth/change-password",
        json={"current_password": "InitialPass123!", "new_password": "ChangedPass123!"},
        headers={"Authorization": f"Bearer {s1_token}"},
    )
    assert change_res.status_code == 200
    fresh_token = change_res.json()["access_token"]

    # Old access tokens fail (401)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {s1_token}"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {s2_token}"}).status_code == 401
    # Fresh token returned to caller works
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh_token}"}).status_code == 200

    # Old refresh cookie fails (401)
    client.cookies.clear()
    client.cookies.set("present_refresh_token", s2_refresh)
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()

    # 2. Group admin password reset invalidates victim's access token and refresh cookie
    owner_token, _, _ = _register(client, "grp_reset_owner")
    victim_token, victim_user, victim_refresh = _register(client, "grp_reset_victim")
    grp = client.post("/api/groups", json={"name": "Reset Group"}, headers={"Authorization": f"Bearer {owner_token}"}).json()
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {victim_token}"})

    assert client.post(
        f"/api/groups/{grp['id']}/admin/reset-member-password",
        json={"user_id": victim_user["id"], "new_password": "GroupReset123!"},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).status_code == 200

    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {victim_token}"}).status_code == 401
    client.cookies.clear()
    client.cookies.set("present_refresh_token", victim_refresh)
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()

    # 3. Superuser password reset invalidates victim's access token and refresh cookie
    su_token, su_user, _ = _register(client, "su_resetter")
    db_su = db.query(User).filter(User.id == su_user["id"]).first()
    db_su.is_superuser = True
    db.commit()

    victim_login = client.post("/api/auth/login", json={"username": "grp_reset_victim", "password": "GroupReset123!"})
    v2_token = victim_login.json()["access_token"]
    v2_refresh = victim_login.cookies.get("present_refresh_token")

    assert client.post(
        f"/api/settings/users/{victim_user['id']}/reset-password",
        json={"new_password": "SuperReset123!"},
        headers={"Authorization": f"Bearer {su_token}"},
    ).status_code == 200

    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {v2_token}"}).status_code == 401
    client.cookies.clear()
    client.cookies.set("present_refresh_token", v2_refresh)
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()


def test_scrape_endpoint_requires_auth_and_rate_limits(client, monkeypatch):
    async def _fake_scrape(url: str):
        return {
            "title": "Mock Item",
            "description": "",
            "image_url": "",
            "price": 12.34,
            "currency": "USD",
            "vendor": "Example",
            "clean_url": url,
        }

    monkeypatch.setattr("app.routers.wishlists.scrape_product_url", _fake_scrape)

    # Unauthenticated request is rejected (401)
    assert client.post("/api/wishlists/scrape", json={"url": "https://example.com/p/1"}).status_code == 401

    # Authenticated request succeeds and hits 429 rate limit after 20 calls
    token, _, _ = _register(client, "scraper_user")
    limiter.clear()
    settings.RATE_LIMIT_ENABLED = True
    statuses = []
    for _ in range(22):
        r = client.post(
            "/api/wishlists/scrape",
            json={"url": "https://example.com/p/1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        statuses.append(r.status_code)
    assert statuses[0] == 200
    assert 429 in statuses
    limiter.clear()


def test_deactivated_manager_profiles_excluded_from_preferences_and_groups(client, db):
    token_a, user_a, _ = _register(client, "deact_mgr", full_name="Alice")
    token_b, _, _ = _register(client, "active_peer", full_name="Bob")

    grp = client.post("/api/groups", json={"name": "Active Circle"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {token_b}"})

    child = client.post("/api/profiles", json={"name": "Child Leo"}, headers={"Authorization": f"Bearer {token_a}"}).json()
    client.put(
        f"/api/preferences/profiles/{child['id']}",
        json={"categories": {"sweet_treats": "Gummy bears"}},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    # Deactivate Alice
    db_a = db.query(User).filter(User.id == user_a["id"]).first()
    db_a.is_active = False
    db.commit()

    # Peer cannot see Alice or Child Leo in /preferences/family, /preferences/profiles/{id}, or /groups
    fam = client.get("/api/preferences/family", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert [p["name"] for p in fam] == ["Bob"]
    assert client.get(f"/api/preferences/profiles/{child['id']}", headers={"Authorization": f"Bearer {token_b}"}).status_code == 404

    groups_b = client.get("/api/groups", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert [m["username"] for m in groups_b[0]["members"]] == ["active_peer"]


def test_secret_santa_reveal_strict_identity_and_active_manager(client, db):
    host_token, _, _ = _register(client, "ss_ident_host", full_name="Host")
    sam1_token, sam1_user, _ = _register(client, "sam_empty", full_name="Sam")
    mgr_token, mgr_user, _ = _register(client, "ss_inactive_mgr", full_name="InactiveMgr")

    grp = client.post("/api/groups", json={"name": "Identity Circle"}, headers={"Authorization": f"Bearer {host_token}"}).json()
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {sam1_token}"})
    client.post("/api/groups/join", json={"invite_code": grp["invite_code"]}, headers={"Authorization": f"Bearer {mgr_token}"})

    # Host creates a ManagedProfile also named "Sam" with populated preferences
    child_sam = client.post("/api/profiles", json={"name": "Sam"}, headers={"Authorization": f"Bearer {host_token}"}).json()
    client.put(
        f"/api/preferences/profiles/{child_sam['id']}",
        json={"categories": {"sweet_treats": "CHILD_SAM_SECRET"}},
        headers={"Authorization": f"Bearer {host_token}"},
    )

    # InactiveMgr creates ManagedProfile "ChildAlex" with populated preferences, then is deactivated
    child_alex = client.post("/api/profiles", json={"name": "ChildAlex"}, headers={"Authorization": f"Bearer {mgr_token}"}).json()
    client.put(
        f"/api/preferences/profiles/{child_alex['id']}",
        json={"categories": {"sweet_treats": "INACTIVE_MGR_CHILD_SECRET"}},
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    db_mgr = db.query(User).filter(User.id == mgr_user["id"]).first()
    db_mgr.is_active = False
    db.commit()

    # Draw includes Host, Sam (bound to sam_empty User who has NO preferences), and ChildAlex (deactivated manager)
    pairs = client.post(
        "/api/secret-santa",
        json={
            "group_id": grp["id"],
            "title": "Identity Test Draw",
            "participants": ["Host", "Sam", "ChildAlex"],
        },
        headers={"Authorization": f"Bearer {host_token}"},
    ).json()

    for pair in pairs:
        reveal = client.get(f"/api/secret-santa/reveal/{pair['view_token']}").json()
        if reveal["receiver_name"] == "Sam":
            # Must NOT fall back to child_sam's preferences
            assert reveal["receiver_preferences"] is None
        if reveal["receiver_name"] == "ChildAlex":
            # Must NOT expose deactivated manager's ManagedProfile preferences
            assert reveal["receiver_preferences"] is None


def test_wishlist_item_rejects_non_http_url_schemes(client):
    token, _, _ = _register(client, "url_scheme_user")
    wl = client.post("/api/wishlists", json={"title": "Safe URLs"}, headers={"Authorization": f"Bearer {token}"}).json()

    # javascript: and data: URLs are rejected (422)
    assert client.post(
        f"/api/wishlists/{wl['id']}/items",
        json={"title": "Bad Link", "url": "javascript:alert(1)"},
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 422
    assert client.post(
        f"/api/wishlists/{wl['id']}/items",
        json={"title": "Bad Image", "image_url": "data:text/html,<script>alert(1)</script>"},
        headers={"Authorization": f"Bearer {token}"},
    ).status_code == 422

    # Valid https URL and empty/omitted URL succeed
    ok_item = client.post(
        f"/api/wishlists/{wl['id']}/items",
        json={"title": "Good Link", "url": "https://example.com/gift", "image_url": ""},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok_item.status_code == 200
    assert ok_item.json()["url"] == "https://example.com/gift"
    assert ok_item.json()["image_url"] is None
