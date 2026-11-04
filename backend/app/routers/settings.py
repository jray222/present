from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pyotp
import qrcode
import io
import base64
from app.database import get_db
from app.models import User, BackupCode, PasskeyCredential, SystemSetting
from app.deps import get_current_user
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
def get_system_config(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_url").first()
    public_url = setting.value if setting else settings.PUBLIC_URL
    return {
        "public_url": public_url,
        "default_url": settings.PUBLIC_URL,
    }

@router.post("/system")
def update_system_config(payload: SystemConfigRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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

