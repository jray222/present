import json
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor,
    UserVerificationRequirement,
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
)
from app.database import get_db
from app.models import User, PasskeyCredential
from app.deps import get_current_user
from app.config import settings
from app.routers.auth import _issue_tokens
from app.services.rate_limiter import rate_limit

router = APIRouter(prefix="/auth/passkey", tags=["passkey"])

# In-memory challenge store (keyed by user_id or session token)
_challenges: dict[str, str] = {}

class PasskeyRegisterVerifyRequest(BaseModel):
    response: dict
    name: str = "My Passkey"

class PasskeyLoginVerifyRequest(BaseModel):
    username: str
    response: dict

@router.post("/register/options")
def passkey_register_options(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing_creds = [
        PublicKeyCredentialDescriptor(id=cred.credential_id.encode("utf-8"))
        for cred in user.passkeys
    ]

    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=str(user.id).encode("utf-8"),
        user_name=user.username,
        user_display_name=user.full_name or user.username,
        attestation="none",
        exclude_credentials=existing_creds,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )

    _challenges[f"reg_{user.id}"] = options.challenge.decode("utf-8") if isinstance(options.challenge, bytes) else options.challenge
    return json.loads(options_to_json(options))

@router.post("/register/verify")
def passkey_register_verify(
    payload: PasskeyRegisterVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    challenge = _challenges.pop(f"reg_{user.id}", None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expired or missing.")

    try:
        verification = verify_registration_response(
            credential=payload.response,
            expected_challenge=challenge.encode("utf-8"),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Passkey registration failed: {e}")

    cred = PasskeyCredential(
        user_id=user.id,
        credential_id=verification.credential_id.decode("utf-8") if isinstance(verification.credential_id, bytes) else str(verification.credential_id),
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        name=payload.name or "Passkey",
    )
    db.add(cred)
    db.commit()

    return {"status": "passkey_registered", "name": cred.name}

@router.post(
    "/login/options",
    dependencies=[Depends(rate_limit(settings.RATE_LIMIT_PASSKEY_PER_MINUTE, 60, "passkey-login"))]
)
def passkey_login_options(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    allowed = [
        PublicKeyCredentialDescriptor(id=cred.credential_id.encode("utf-8"))
        for cred in user.passkeys
    ]
    if not allowed:
        raise HTTPException(status_code=400, detail="No passkeys registered for this user.")

    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=allowed,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    _challenges[f"login_{user.id}"] = options.challenge.decode("utf-8") if isinstance(options.challenge, bytes) else options.challenge
    return json.loads(options_to_json(options))

@router.post(
    "/login/verify",
    dependencies=[Depends(rate_limit(settings.RATE_LIMIT_PASSKEY_PER_MINUTE, 60, "passkey-login"))]
)
def passkey_login_verify(
    payload: PasskeyLoginVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == payload.username.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    challenge = _challenges.pop(f"login_{user.id}", None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expired or missing.")

    cred_id = payload.response.get("id")
    cred = db.query(PasskeyCredential).filter(
        PasskeyCredential.user_id == user.id,
        PasskeyCredential.credential_id == cred_id,
    ).first()
    if not cred:
        raise HTTPException(status_code=400, detail="Credential not recognized.")

    try:
        verification = verify_authentication_response(
            credential=payload.response,
            expected_challenge=challenge.encode("utf-8"),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            credential_public_key=cred.public_key,
            credential_current_sign_count=cred.sign_count,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Passkey verification failed: {e}")

    cred.sign_count = verification.new_sign_count
    from datetime import datetime, timezone
    cred.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return _issue_tokens(user, db, response, request)
