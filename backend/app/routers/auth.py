from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, RefreshToken, BackupCode
from app.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut, TwoFactorVerifyRequest
from app.security import (
    hash_password, verify_password, create_access_token,
    generate_refresh_token, hash_token, decrypt_secret
)
from app.deps import get_current_user, get_client_ip
from app.config import settings
import pyotp

router = APIRouter(prefix="/auth", tags=["auth"])

def _user_to_out(user: User) -> UserOut:
    is_google = bool(user.google_sub)
    # If not a Google OAuth user, 2FA is required for security!
    requires_2fa = not is_google and not user.totp_enabled

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        avatar_color=user.avatar_color,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        totp_enabled=user.totp_enabled,
        is_google_user=is_google,
        requires_2fa_setup=requires_2fa,
        has_passkey=len(user.passkeys) > 0,
    )

def _issue_tokens(user: User, db: Session, response: Response, request: Request) -> TokenResponse:
    access_token = create_access_token(user.id)
    raw_refresh, token_hash = generate_refresh_token()

    from datetime import datetime, timedelta, timezone
    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:250],
        ip_address=get_client_ip(request),
    )
    db.add(refresh_record)
    db.commit()

    # Set httpOnly cookie
    response.set_cookie(
        key="present_refresh_token",
        value=raw_refresh,
        httponly=True,
        samesite="lax",
        secure=False,  # allows localhost
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    return TokenResponse(
        access_token=access_token,
        user=_user_to_out(user),
    )

@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    if not settings.ALLOW_REGISTRATION:
        count = db.query(User).count()
        if count > 0:
            raise HTTPException(status_code=403, detail="Registration is invite-only.")

    existing = db.query(User).filter(User.username == payload.username.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken.")

    if payload.email:
        existing_email = db.query(User).filter(User.email == payload.email.strip().lower()).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered.")

    is_first_user = db.query(User).count() == 0

    user = User(
        username=payload.username.strip().lower(),
        email=payload.email.strip().lower() if payload.email else None,
        full_name=payload.full_name or payload.username,
        avatar_color=payload.avatar_color or "emerald",
        password_hash=hash_password(payload.password),
        is_superuser=is_first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _issue_tokens(user, db, response, request)

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username.strip().lower()).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if user.totp_enabled:
        # Require 2FA verification step
        temp_token = create_access_token(user.id)
        raise HTTPException(
            status_code=403,
            detail={"mfa_required": True, "temp_token": temp_token}
        )

    return _issue_tokens(user, db, response, request)

@router.post("/verify-2fa", response_model=TokenResponse)
def verify_2fa(payload: TwoFactorVerifyRequest, response: Response, request: Request, db: Session = Depends(get_db)):
    from app.security import decode_token
    token_data = decode_token(payload.temp_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Session expired.")

    user = db.query(User).filter(User.id == int(token_data["sub"])).first()
    if not user or not user.totp_enabled:
        raise HTTPException(status_code=400, detail="Invalid 2FA state.")

    secret = decrypt_secret(user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)
    code = payload.code.strip().replace(" ", "").replace("-", "")

    # Check totp code
    if totp.verify(code, valid_window=1):
        return _issue_tokens(user, db, response, request)

    # Check backup code
    code_hash = hash_token(code.upper())
    backup = db.query(BackupCode).filter(
        BackupCode.user_id == user.id,
        BackupCode.code_hash == code_hash,
        BackupCode.used == False,
    ).first()
    if backup:
        backup.used = True
        from datetime import datetime, timezone
        backup.used_at = datetime.now(timezone.utc)
        db.commit()
        return _issue_tokens(user, db, response, request)

    raise HTTPException(status_code=401, detail="Invalid 2FA or backup code.")

@router.post("/refresh", response_model=TokenResponse)
def refresh_session(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_token = request.cookies.get("present_refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="No refresh token cookie.")

    token_hash = hash_token(raw_token)
    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked == False,
    ).first()

    from datetime import datetime, timezone
    if not record or record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked.")

    user = record.user
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User account inactive.")

    # Rotate refresh token
    record.revoked = True
    return _issue_tokens(user, db, response, request)

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_token = request.cookies.get("present_refresh_token")
    if raw_token:
        token_hash = hash_token(raw_token)
        record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
        if record:
            record.revoked = True
            db.commit()
    response.delete_cookie(key="present_refresh_token", path="/")
    return {"status": "logged_out"}

@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return _user_to_out(user)
