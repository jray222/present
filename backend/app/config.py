import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DATA_DIR = _BACKEND_DIR / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_KEY_FILE = _DATA_DIR / "secret_key"

def _load_or_generate_secret_key() -> str:
    env_key = os.getenv("SECRET_KEY", "").strip()
    if env_key:
        return env_key
    if _KEY_FILE.exists():
        key = _KEY_FILE.read_text().strip()
        if key:
            return key
    key = secrets.token_urlsafe(32)
    _KEY_FILE.write_text(key)
    return key

class Settings(BaseSettings):
    SECRET_KEY: str = _load_or_generate_secret_key()
    DATA_KEYS: str = ""
    DATABASE_URL: str = f"sqlite:///{_DATA_DIR / 'present.db'}"
    ALLOW_REGISTRATION: bool = True
    PUBLIC_URL: str = "http://localhost:5173"
    TRUST_PROXY_HEADERS: bool = True
    TRUSTED_PROXIES: str = ""

    # WebAuthn / Passkeys
    WEBAUTHN_RP_ID: str = "localhost"
    WEBAUTHN_RP_NAME: str = "Present - Family Wishlists"
    WEBAUTHN_ORIGIN: str = "http://localhost:5173"

    # Google OAuth (Optional)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Rate limiting & token lifetimes
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    class Config:
        env_file = str(_BACKEND_DIR / ".env")
        extra = "ignore"

settings = Settings()
