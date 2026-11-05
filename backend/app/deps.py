import ipaddress
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.security import decode_token
from app.config import settings

_bearer_scheme = HTTPBearer(auto_error=False)

def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials or not credentials.credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    return user

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = get_current_user_optional(credentials, db)
    if not user:
        raise unauthorized
    return user

def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )
    return user

def get_client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client else "127.0.0.1"

    if not settings.TRUST_PROXY_HEADERS:
        return direct_ip

    if settings.TRUSTED_PROXIES:
        trusted_list = [p.strip() for p in settings.TRUSTED_PROXIES.split(",") if p.strip()]
        is_trusted = False
        try:
            direct_addr = ipaddress.ip_address(direct_ip)
            for proxy in trusted_list:
                if "/" in proxy:
                    if direct_addr in ipaddress.ip_network(proxy, strict=False):
                        is_trusted = True
                        break
                elif direct_ip == proxy:
                    is_trusted = True
                    break
        except ValueError:
            if direct_ip in trusted_list:
                is_trusted = True

        if not is_trusted:
            return direct_ip

    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    x_real = request.headers.get("x-real-ip")
    if x_real:
        return x_real.strip()
    x_forwarded = request.headers.get("x-forwarded-for")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()

    return direct_ip
