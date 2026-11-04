from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import ManagedProfile, User
from app.schemas import ManagedProfileCreate, ManagedProfileOut
from app.deps import get_current_user

router = APIRouter(prefix="/profiles", tags=["profiles"])

@router.get("", response_model=List[ManagedProfileOut])
def list_managed_profiles(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ManagedProfile).filter(ManagedProfile.manager_user_id == user.id).all()

@router.post("", response_model=ManagedProfileOut)
def create_managed_profile(payload: ManagedProfileCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = ManagedProfile(
        manager_user_id=user.id,
        name=payload.name.strip(),
        avatar_emoji=payload.avatar_emoji or "🧸",
        notes=payload.notes,
        birth_date=payload.birth_date,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile

@router.delete("/{profile_id}")
def delete_managed_profile(profile_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(ManagedProfile).filter(
        ManagedProfile.id == profile_id,
        ManagedProfile.manager_user_id == user.id,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    db.delete(profile)
    db.commit()
    return {"status": "deleted"}
