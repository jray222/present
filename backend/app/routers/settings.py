from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pyotp
import qrcode
import io
import base64
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from typing import List, Optional
from app.database import get_db
from app.models import User, BackupCode, PasskeyCredential, SystemSetting
from app.deps import get_current_user, get_current_admin_user
from app.config import settings
from app.security import encrypt_secret, decrypt_secret, generate_backup_codes, hash_token

router = APIRouter(prefix="/settings", tags=["settings"])

class TwoFactorConfirmRequest(BaseModel):
    code: str

@router.post("/2fa/setup")
def setup_2fa(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = pyotp.random_base32()
    user.totp_secret_encrypted = encrypt_secret(secret)
    db.commit()

    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user.username, issuer_name="Present Wishlists")

    # Generate QR Code PNG in Base64
    qr = qrcode.QRCode(box_size=6, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
    }

@router.post("/2fa/confirm")
def confirm_2fa(payload: TwoFactorConfirmRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="Call /settings/2fa/setup first.")

    secret = decrypt_secret(user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)
    code = payload.code.strip().replace(" ", "").replace("-", "")

    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    user.totp_enabled = True
    from datetime import datetime, timezone
    user.totp_confirmed_at = datetime.now(timezone.utc)

    # Generate 8 backup codes
    plain_codes = generate_backup_codes(8)
    for c in plain_codes:
        db.add(BackupCode(user_id=user.id, code_hash=hash_token(c.replace("-", "").upper())))

    db.commit()

    return {
        "status": "2fa_enabled",
        "backup_codes": plain_codes,
    }

@router.post("/2fa/disable")
def disable_2fa(payload: TwoFactorConfirmRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled.")

    secret = decrypt_secret(user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)
    code = payload.code.strip().replace(" ", "").replace("-", "")

    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code.")

    user.totp_enabled = False
    user.totp_secret_encrypted = None
    # Delete unused backup codes
    db.query(BackupCode).filter(BackupCode.user_id == user.id).delete()
    db.commit()

    return {"status": "2fa_disabled"}

@router.get("/passkeys")
def list_passkeys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        {
            "id": p.id,
            "name": p.name,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "last_used_at": p.last_used_at.isoformat() if p.last_used_at else None,
        }
        for p in user.passkeys
    ]

@router.delete("/passkeys/{passkey_id}")
def delete_passkey(passkey_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(PasskeyCredential).filter(
        PasskeyCredential.id == passkey_id,
        PasskeyCredential.user_id == user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Passkey not found.")
    db.delete(p)
    db.commit()
    return {"status": "deleted"}

class SystemConfigRequest(BaseModel):
    public_url: str

@router.get("/system")
def get_system_config(user: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_url").first()
    public_url = setting.value if setting else settings.PUBLIC_URL
    return {
        "public_url": public_url,
        "default_url": settings.PUBLIC_URL,
        "is_admin": user.is_superuser,
    }

@router.post("/system")
def update_system_config(
    payload: SystemConfigRequest,
    user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    url = payload.public_url.strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Public URL must start with http:// or https://")

    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_url").first()
    if not setting:
        setting = SystemSetting(key="public_url", value=url)
        db.add(setting)
    else:
        setting.value = url
    db.commit()
    return {"status": "saved", "public_url": url}

# --- Admin User Management ---

class UserRoleUpdate(BaseModel):
    is_superuser: bool

@router.get("/users")
def list_system_users(admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.asc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "is_superuser": u.is_superuser,
            "is_active": u.is_active,
            "totp_enabled": u.totp_enabled,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]

@router.post("/users/{target_user_id}/role")
def set_user_role(
    target_user_id: int,
    payload: UserRoleUpdate,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    if target.id == admin.id and not payload.is_superuser:
        # Don't let the last admin demote themselves
        admin_count = db.query(User).filter(User.is_superuser == True).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only remaining admin.")

    target.is_superuser = payload.is_superuser
    db.commit()
    return {"status": "updated", "user_id": target.id, "is_superuser": target.is_superuser}

class AdminResetPasswordRequest(BaseModel):
    new_password: str

@router.post("/users/{target_user_id}/reset-password")
def admin_reset_user_password(
    target_user_id: int,
    payload: AdminResetPasswordRequest,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    from app.security import hash_password
    target.password_hash = hash_password(payload.new_password)
    target.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "password_reset", "user_id": target.id}

# --- Database Backup / Export ---

@router.get("/backup")
def export_database_backup(
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_current_admin_user)
):
    if not settings.DATABASE_URL.startswith("sqlite"):
        raise HTTPException(status_code=400, detail="Database backup is only supported for SQLite databases.")

    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    resolved_path = os.path.abspath(db_path)
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail="Database file not found on disk.")

    temp_backup = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    temp_backup.close()

    src = sqlite3.connect(resolved_path)
    dest = sqlite3.connect(temp_backup.name)
    try:
        with dest:
            src.backup(dest)
    finally:
        src.close()
        dest.close()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"present_backup_{timestamp}.db"
    background_tasks.add_task(os.unlink, temp_backup.name)
    return FileResponse(
        path=temp_backup.name,
        filename=filename,
        media_type="application/x-sqlite3",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
