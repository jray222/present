import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from app.database import get_db
from app.models import FamilyGroup, GroupMember, SecretSantaDraw, SecretSantaPair, User
from app.deps import get_current_user
from app.services.secret_santa import solve_secret_santa
from app.config import settings

router = APIRouter(prefix="/secret-santa", tags=["secret-santa"])

class CreateDrawRequest(BaseModel):
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

class DrawOut(BaseModel):
    id: int
    title: str
    budget_limit: Optional[float] = None
    exchange_date: Optional[str] = None
    rules_notes: Optional[str] = None
    is_active: bool
    pairs_count: int

@router.get("", response_model=List[DrawOut])
def list_draws(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # User's group draws
    groups = [m.group_id for m in user.group_memberships]
    draws = db.query(SecretSantaDraw).filter(SecretSantaDraw.group_id.in_(groups)).all() if groups else []
    return [
        DrawOut(
            id=d.id,
            title=d.title,
            budget_limit=float(d.budget_limit) if d.budget_limit else None,
            exchange_date=d.exchange_date,
            rules_notes=d.rules_notes,
            is_active=d.is_active,
            pairs_count=len(d.pairs)
        )
        for d in draws
    ]

@router.post("", response_model=List[PairOut])
def create_and_run_draw(payload: CreateDrawRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(payload.participants) < 2:
        raise HTTPException(status_code=400, detail="Secret Santa requires at least 2 participants.")

    # Find or create a default group for the user if none
    member = user.group_memberships[0] if user.group_memberships else None
    if not member:
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
    else:
        group_id = member.group_id

    # Format participants for solver
    participant_dicts = [{"id": name, "name": name} for name in payload.participants]
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

    return [
        PairOut(
            id=p.id,
            giver_name=p.giver_name,
            receiver_name=p.receiver_name,
            view_token=p.view_token,
            view_url=f"{settings.PUBLIC_URL}/santa/view/{p.view_token}",
        )
        for p in created_pairs
    ]

@router.get("/reveal/{token}")
def reveal_secret_santa(token: str, db: Session = Depends(get_db)):
    pair = db.query(SecretSantaPair).filter(SecretSantaPair.view_token == token).first()
    if not pair:
        raise HTTPException(status_code=404, detail="Invalid Secret Santa token.")

    from datetime import datetime, timezone
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
