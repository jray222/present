import json
import secrets
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import FamilyGroup, GroupMember, SecretSantaDraw, SecretSantaPair, SystemSetting, User
from app.deps import get_current_user
from app.services.secret_santa import solve_secret_santa
from app.config import settings
from app.services.rate_limiter import rate_limit

router = APIRouter(prefix="/secret-santa", tags=["secret-santa"])


class CreateDrawRequest(BaseModel):
    group_id: Optional[int] = None
    title: str
    budget_limit: Optional[float] = None
    exchange_date: Optional[str] = None
    rules_notes: Optional[str] = None
    participants: List[str]  # list of names (e.g. ["Mom", "Dad", "Sarah", "John"])
    exclusions: Optional[Dict[str, List[str]]] = None  # {"John": ["Sarah"]}


class PairOut(BaseModel):
    id: int
    giver_name: str
    receiver_name: str
    view_token: str
    view_url: str
    viewed_at: Optional[str] = None


class DrawOut(BaseModel):
    id: int
    group_id: int
    title: str
    budget_limit: Optional[float] = None
    exchange_date: Optional[str] = None
    rules_notes: Optional[str] = None
    is_active: bool
    pairs_count: int
    participants: List[str] = []
    exclusions: Dict[str, List[str]] = {}
    pairs: List[PairOut] = []
    is_admin: bool = False


def _get_base_url(db: Session, request: Optional[Request] = None) -> str:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_url").first()
    if setting and setting.value:
        return setting.value.rstrip("/")
    base_url = settings.PUBLIC_URL.rstrip("/")
    if request:
        host = request.headers.get("host")
        if host and host != "testserver" and "localhost" in base_url:
            scheme = request.url.scheme
            base_url = f"{scheme}://{host}"
    return base_url


def _parse_exclusions(raw: Optional[str]) -> Dict[str, List[str]]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {
                str(k): [str(v) for v in vals]
                for k, vals in parsed.items()
                if isinstance(vals, list)
            }
    except Exception:
        pass
    return {}


def _format_pair(p: SecretSantaPair, base_url: str) -> PairOut:
    return PairOut(
        id=p.id,
        giver_name=p.giver_name,
        receiver_name=p.receiver_name,
        view_token=p.view_token,
        view_url=f"{base_url}/santa/view/{p.view_token}",
        viewed_at=p.viewed_at.isoformat() if p.viewed_at else None,
    )


def _user_can_access_draw(user: User, draw: SecretSantaDraw) -> bool:
    if user.is_superuser:
        return True
    return any(m.group_id == draw.group_id for m in user.group_memberships)


def _user_is_draw_admin(user: User, draw: SecretSantaDraw) -> bool:
    if user.is_superuser:
        return True
    return any(
        m.group_id == draw.group_id and m.role in ("owner", "admin")
        for m in user.group_memberships
    )


def _format_draw(d: SecretSantaDraw, user: User, base_url: str) -> DrawOut:
    pairs_out = [_format_pair(p, base_url) for p in d.pairs]
    participants = [p.giver_name for p in d.pairs]
    return DrawOut(
        id=d.id,
        group_id=d.group_id,
        title=d.title,
        budget_limit=float(d.budget_limit) if d.budget_limit is not None else None,
        exchange_date=d.exchange_date,
        rules_notes=d.rules_notes,
        is_active=d.is_active,
        pairs_count=len(d.pairs),
        participants=participants,
        exclusions=_parse_exclusions(d.exclusions_json),
        pairs=pairs_out,
        is_admin=_user_is_draw_admin(user, d),
    )


def _clean_participants(names: List[str]) -> List[str]:
    cleaned = [n.strip() for n in names if n and n.strip()]
    if len(cleaned) < 2:
        raise HTTPException(status_code=400, detail="Secret Santa requires at least 2 participants.")
    if len(set(cleaned)) != len(cleaned):
        raise HTTPException(status_code=400, detail="Participant names must be unique.")
    return cleaned


@router.get("", response_model=List[DrawOut])
def list_draws(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base_url = _get_base_url(db, request)
    if user.is_superuser:
        draws = db.query(SecretSantaDraw).order_by(SecretSantaDraw.id.desc()).all()
    else:
        groups = [m.group_id for m in user.group_memberships]
        draws = (
            db.query(SecretSantaDraw)
            .filter(SecretSantaDraw.group_id.in_(groups))
            .order_by(SecretSantaDraw.id.desc())
            .all()
            if groups
            else []
        )
    return [_format_draw(d, user, base_url) for d in draws]


@router.get("/{draw_id}", response_model=DrawOut)
def get_draw(
    draw_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draw = db.query(SecretSantaDraw).filter(SecretSantaDraw.id == draw_id).first()
    if not draw or not _user_can_access_draw(user, draw):
        raise HTTPException(status_code=404, detail="Secret Santa draw not found.")
    base_url = _get_base_url(db, request)
    return _format_draw(draw, user, base_url)


@router.post("", response_model=List[PairOut])
def create_and_run_draw(
    payload: CreateDrawRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    participants = _clean_participants(payload.participants)

    # Determine target group
    user_group_ids = {m.group_id for m in user.group_memberships}
    if payload.group_id and (payload.group_id in user_group_ids or user.is_superuser):
        group_id = payload.group_id
    elif user.group_memberships:
        group_id = user.group_memberships[0].group_id
    else:
        group = FamilyGroup(
            name=f"{user.full_name or user.username}'s Family",
            invite_code=secrets.token_urlsafe(8).upper(),
            created_by_user_id=user.id,
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        gm = GroupMember(group_id=group.id, user_id=user.id, role="owner")
        db.add(gm)
        db.commit()
        group_id = group.id

    participant_dicts = [{"id": name, "name": name} for name in participants]
    try:
        pairs = solve_secret_santa(participant_dicts, payload.exclusions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    draw = SecretSantaDraw(
        group_id=group_id,
        title=payload.title.strip(),
        budget_limit=payload.budget_limit,
        exchange_date=payload.exchange_date,
        rules_notes=payload.rules_notes,
        exclusions_json=json.dumps(payload.exclusions or {}),
    )
    db.add(draw)
    db.commit()
    db.refresh(draw)

    created_pairs = []
    for giver, receiver in pairs:
        token = secrets.token_urlsafe(20)
        p = SecretSantaPair(
            draw_id=draw.id,
            giver_name=giver["name"],
            receiver_name=receiver["name"],
            view_token=token,
        )
        db.add(p)
        created_pairs.append(p)
    db.commit()

    base_url = _get_base_url(db, request)
    return [_format_pair(p, base_url) for p in created_pairs]


@router.put("/{draw_id}", response_model=DrawOut)
@router.patch("/{draw_id}", response_model=DrawOut)
def update_and_run_draw(
    draw_id: int,
    payload: CreateDrawRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draw = db.query(SecretSantaDraw).filter(SecretSantaDraw.id == draw_id).first()
    if not draw or not _user_can_access_draw(user, draw):
        raise HTTPException(status_code=404, detail="Secret Santa draw not found.")

    participants = _clean_participants(payload.participants)
    participant_dicts = [{"id": name, "name": name} for name in participants]
    try:
        pairs = solve_secret_santa(participant_dicts, payload.exclusions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    draw.title = payload.title.strip()
    draw.budget_limit = payload.budget_limit
    draw.exchange_date = payload.exchange_date
    draw.rules_notes = payload.rules_notes
    draw.exclusions_json = json.dumps(payload.exclusions or {})

    db.query(SecretSantaPair).filter(SecretSantaPair.draw_id == draw.id).delete()
    db.flush()

    for giver, receiver in pairs:
        token = secrets.token_urlsafe(20)
        db.add(
            SecretSantaPair(
                draw_id=draw.id,
                giver_name=giver["name"],
                receiver_name=receiver["name"],
                view_token=token,
            )
        )

    db.commit()
    db.refresh(draw)
    base_url = _get_base_url(db, request)
    return _format_draw(draw, user, base_url)


@router.post("/{draw_id}/redraw", response_model=DrawOut)
def redraw_secret_santa(
    draw_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draw = db.query(SecretSantaDraw).filter(SecretSantaDraw.id == draw_id).first()
    if not draw or not _user_can_access_draw(user, draw):
        raise HTTPException(status_code=404, detail="Secret Santa draw not found.")

    participants = [p.giver_name for p in draw.pairs]
    exclusions = _parse_exclusions(draw.exclusions_json)
    participant_dicts = [{"id": name, "name": name} for name in participants]
    try:
        pairs = solve_secret_santa(participant_dicts, exclusions)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.query(SecretSantaPair).filter(SecretSantaPair.draw_id == draw.id).delete()
    db.flush()

    for giver, receiver in pairs:
        token = secrets.token_urlsafe(20)
        db.add(
            SecretSantaPair(
                draw_id=draw.id,
                giver_name=giver["name"],
                receiver_name=receiver["name"],
                view_token=token,
            )
        )

    db.commit()
    db.refresh(draw)
    base_url = _get_base_url(db, request)
    return _format_draw(draw, user, base_url)


@router.delete("/{draw_id}")
def delete_draw(
    draw_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draw = db.query(SecretSantaDraw).filter(SecretSantaDraw.id == draw_id).first()
    if not draw or not _user_can_access_draw(user, draw):
        raise HTTPException(status_code=404, detail="Secret Santa draw not found.")

    db.delete(draw)
    db.commit()
    return {"status": "deleted", "id": draw_id}


@router.get(
    "/reveal/{token}",
    dependencies=[Depends(rate_limit(settings.RATE_LIMIT_SANTA_REVEAL_PER_MINUTE, 60, "santa-reveal"))]
)
def reveal_secret_santa(token: str, db: Session = Depends(get_db)):
    pair = db.query(SecretSantaPair).filter(SecretSantaPair.view_token == token).first()
    if not pair:
        raise HTTPException(status_code=404, detail="Invalid Secret Santa token.")

    pair.viewed_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "title": pair.draw.title,
        "budget_limit": float(pair.draw.budget_limit) if pair.draw.budget_limit else None,
        "exchange_date": pair.draw.exchange_date,
        "rules_notes": pair.draw.rules_notes,
        "giver_name": pair.giver_name,
        "receiver_name": pair.receiver_name,
    }
