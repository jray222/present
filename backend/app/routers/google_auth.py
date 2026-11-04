import os
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.deps import get_current_user
from app.config import settings
from app.routers.auth import _issue_tokens

router = APIRouter(prefix="/auth/google", tags=["google-auth"])

class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token JWT

@router.get("/config")
def google_config():
    return {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "enabled": bool(settings.GOOGLE_CLIENT_ID),
    }

@router.post("/verify")
def verify_google_token(payload: GoogleAuthRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth is not configured on this server.")

    from google.oauth2 import id_token
    from google.auth.transport import requests

    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential,
            requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google ID token: {e}")

    google_sub = id_info.get("sub")
    email = id_info.get("email")
    name = id_info.get("name") or "Google User"
    picture = id_info.get("picture")

    if not google_sub:
        raise HTTPException(status_code=400, detail="Missing sub in Google token.")

    # Find by google_sub or email
    user = db.query(User).filter(User.google_sub == google_sub).first()
    if not user and email:
        user = db.query(User).filter(User.email == email.lower()).first()
        if user:
            user.google_sub = google_sub
            if not user.avatar_url:
                user.avatar_url = picture

    if not user:
        if not settings.ALLOW_REGISTRATION and db.query(User).count() > 0:
            raise HTTPException(status_code=403, detail="Registration is invite-only.")

        base_username = (email.split("@")[0] if email else name).lower().replace(" ", "")
        username = base_username
        suffix = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}{suffix}"
            suffix += 1

        is_first = db.query(User).count() == 0
        user = User(
            username=username,
            email=email.lower() if email else None,
            full_name=name,
            google_sub=google_sub,
            avatar_url=picture,
            avatar_color="tomato",
            is_superuser=is_first,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return _issue_tokens(user, db, response, request)
