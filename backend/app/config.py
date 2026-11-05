import os
import secrets
from pathlib import Path
from urllib.parse import urlparse
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    PUBLIC_URL: str = "http://localhost:5732"
    FRONTEND_ORIGIN: str = ""
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXIES: str = ""

    # WebAuthn / Passkeys
    WEBAUTHN_RP_ID: str = ""
    WEBAUTHN_RP_NAME: str = "Present - Family Wishlists"
    WEBAUTHN_ORIGIN: str = ""

    # Google OAuth (Optional)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN_PER_MINUTE: int = 10
    RATE_LIMIT_2FA_PER_MINUTE: int = 10
    RATE_LIMIT_PASSKEY_PER_MINUTE: int = 15
    RATE_LIMIT_GUEST_CLAIMS_PER_MINUTE: int = 30
    RATE_LIMIT_SANTA_REVEAL_PER_MINUTE: int = 20
    RATE_LIMIT_REGISTER_PER_MINUTE: int = 10

    # Token lifetimes
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
        extra="ignore",
    )

    def model_post_init(self, __context) -> None:
        if not self.WEBAUTHN_ORIGIN:
            self.WEBAUTHN_ORIGIN = self.PUBLIC_URL.rstrip("/")
        if not self.WEBAUTHN_RP_ID:
            parsed = urlparse(self.PUBLIC_URL)
            self.WEBAUTHN_RP_ID = parsed.hostname or "localhost"

settings = Settings()
