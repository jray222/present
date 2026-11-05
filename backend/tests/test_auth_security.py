import pytest
import pyotp
from app.deps import get_client_ip
from app.config import settings
from app.services.rate_limiter import limiter

def test_2fa_and_backup_codes(client):
    reg = client.post("/api/auth/register", json={"username": "mfa_user", "password": "Password123!"})
    token = reg.json()["access_token"]

    # 1. Start 2FA setup
    setup_res = client.post("/api/settings/2fa/setup", headers={"Authorization": f"Bearer {token}"})
    assert setup_res.status_code == 200
    secret = setup_res.json()["secret"]
    assert len(secret) >= 16

    # 2. Confirm 2FA with TOTP code
    totp = pyotp.TOTP(secret)
    code = totp.now()
    confirm_res = client.post(
        "/api/settings/2fa/confirm",
        json={"code": code},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert confirm_res.status_code == 200
    backup_codes = confirm_res.json()["backup_codes"]
    assert len(backup_codes) == 8

    # 3. Login now requires 2FA step
    login_res = client.post("/api/auth/login", json={"username": "mfa_user", "password": "Password123!"})
    assert login_res.status_code == 403
    mfa_detail = login_res.json()["detail"]
    assert mfa_detail["mfa_required"] is True
    temp_token = mfa_detail["temp_token"]

    # 4. Verify 2FA using backup code
    backup_code = backup_codes[0]
    verify_res = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": temp_token, "code": backup_code}
    )
    assert verify_res.status_code == 200
    assert "access_token" in verify_res.json()

    # Using the same backup code again should fail
    login_again = client.post("/api/auth/login", json={"username": "mfa_user", "password": "Password123!"})
    temp_token2 = login_again.json()["detail"]["temp_token"]
    verify_again = client.post(
        "/api/auth/verify-2fa",
        json={"temp_token": temp_token2, "code": backup_code}
    )
    assert verify_again.status_code == 401

def test_admin_settings_access_control(client):
    # First user is superuser
    admin_reg = client.post("/api/auth/register", json={"username": "sysadmin", "password": "Password123!"})
    admin_token = admin_reg.json()["access_token"]
    assert admin_reg.json()["user"]["is_superuser"] is True

    # Second user is regular member
    user_reg = client.post("/api/auth/register", json={"username": "regular_user", "password": "Password123!"})
    user_token = user_reg.json()["access_token"]
    assert user_reg.json()["user"]["is_superuser"] is False

    # Regular user cannot view system settings (403 Forbidden)
    res_get_forbidden = client.get(
        "/api/settings/system",
        headers={"Authorization": f"Bearer {user_token}"}
    )
    assert res_get_forbidden.status_code == 403

    # Regular user cannot update public URL (403 Forbidden)
    res_forbidden = client.post(
        "/api/settings/system",
        json={"public_url": "https://malicious-site.com"},
        headers={"Authorization": f"Bearer {user_token}"}
    )
    assert res_forbidden.status_code == 403

    # Admin user can view system settings
    res_get_allowed = client.get(
        "/api/settings/system",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_get_allowed.status_code == 200
    assert "public_url" in res_get_allowed.json()

    # Admin user can update public URL
    res_allowed = client.post(
        "/api/settings/system",
        json={"public_url": "https://wishlist.family.org"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_allowed.status_code == 200
    assert res_allowed.json()["public_url"] == "https://wishlist.family.org"

    # Admin lists users
    users_list = client.get("/api/settings/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert users_list.status_code == 200
    assert len(users_list.json()) >= 2

    # Admin promotes regular user to admin
    target_id = user_reg.json()["user"]["id"]
    promo_res = client.post(
        f"/api/settings/users/{target_id}/role",
        json={"is_superuser": True},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert promo_res.status_code == 200
    assert promo_res.json()["is_superuser"] is True

def test_logout_other_devices(client):
    reg = client.post("/api/auth/register", json={"username": "multidevice", "password": "Password123!"})
    token = reg.json()["access_token"]

    # Logout other devices
    res = client.post(
        "/api/auth/logout-other-devices",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "logged_out_others"

def test_client_ip_trusted_proxy_behavior():
    from starlette.requests import Request
    scope = {
        "type": "http",
        "client": ("192.168.1.100", 54321),
        "headers": [(b"x-forwarded-for", b"203.0.113.195")],
    }
    req = Request(scope)

    # When TRUST_PROXY_HEADERS is False, direct client is always returned
    settings.TRUST_PROXY_HEADERS = False
    assert get_client_ip(req) == "192.168.1.100"

    # When TRUST_PROXY_HEADERS is True and TRUSTED_PROXIES matches
    settings.TRUST_PROXY_HEADERS = True
    settings.TRUSTED_PROXIES = "192.168.1.100"
    assert get_client_ip(req) == "203.0.113.195"

    # Reset
    settings.TRUST_PROXY_HEADERS = False
    settings.TRUSTED_PROXIES = ""

def test_rate_limiting(client):
    limiter.clear()
    settings.RATE_LIMIT_ENABLED = True

    # Call login endpoint 12 times quickly (limit is 10)
    status_codes = []
    for _ in range(12):
        r = client.post("/api/auth/login", json={"username": "nosuchuser", "password": "wrong"})
        status_codes.append(r.status_code)

    assert 429 in status_codes
    limiter.clear()

def test_change_password_and_admin_reset(client, db):
    from app.models import User

    # 1. Register normal user
    res = client.post("/api/auth/register", json={"username": "pwd_user", "password": "OldPassword123!"})
    token = res.json()["access_token"]
    user_id = res.json()["user"]["id"]

    # 2. Self change password with wrong current password fails (400)
    bad_res = client.post(
        "/api/auth/change-password",
        json={"current_password": "WrongPassword!", "new_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert bad_res.status_code == 400

    # 3. Self change password with too short password fails (400)
    short_res = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "short"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert short_res.status_code == 400

    # 4. Self change password succeeds
    good_res = client.post(
        "/api/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert good_res.status_code == 200

    # 5. Login with new password succeeds
    login_new = client.post("/api/auth/login", json={"username": "pwd_user", "password": "NewPassword123!"})
    assert login_new.status_code == 200

    # 6. Admin resets password for user
    admin_reg = client.post("/api/auth/register", json={"username": "admin_pwd", "password": "AdminPassword123!"})
    admin_token = admin_reg.json()["access_token"]
    admin_id = admin_reg.json()["user"]["id"]

    admin_record = db.query(User).filter(User.id == admin_id).first()
    admin_record.is_superuser = True
    db.commit()

    reset_res = client.post(
        f"/api/settings/users/{user_id}/reset-password",
        json={"new_password": "AdminSetPassword123!"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert reset_res.status_code == 200

    # User can log in with admin-set password
    login_admin_set = client.post("/api/auth/login", json={"username": "pwd_user", "password": "AdminSetPassword123!"})
    assert login_admin_set.status_code == 200

def test_database_backup_export(client, db):
    import tempfile
    import sqlite3
    from app.models import User

    # Create admin user
    admin_reg = client.post("/api/auth/register", json={"username": "admin_backup", "password": "AdminPassword123!"})
    admin_token = admin_reg.json()["access_token"]
    admin_id = admin_reg.json()["user"]["id"]

    admin_record = db.query(User).filter(User.id == admin_id).first()
    admin_record.is_superuser = True
    db.commit()

    # Non-admin cannot export backup (403)
    user_reg = client.post("/api/auth/register", json={"username": "user_backup", "password": "UserPassword123!"})
    user_token = user_reg.json()["access_token"]
    res_forbidden = client.get("/api/settings/backup", headers={"Authorization": f"Bearer {user_token}"})
    assert res_forbidden.status_code == 403

    # Point DATABASE_URL temporarily to a real sqlite file on disk
    with tempfile.NamedTemporaryFile(suffix=".db") as f:
        conn = sqlite3.connect(f.name)
        conn.execute("CREATE TABLE test (id INT)")
        conn.commit()
        conn.close()

        old_url = settings.DATABASE_URL
        settings.DATABASE_URL = f"sqlite:///{f.name}"
        try:
            res_backup = client.get("/api/settings/backup", headers={"Authorization": f"Bearer {admin_token}"})
            assert res_backup.status_code == 200
            assert "application/x-sqlite3" in res_backup.headers["content-type"]
            assert "attachment; filename=" in res_backup.headers["content-disposition"]
            assert len(res_backup.content) > 0
        finally:
            settings.DATABASE_URL = old_url
