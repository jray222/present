from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import ManagedProfile, User
from app.schemas import ManagedProfileCreate, ManagedProfileUpdate, ManagedProfileOut
from app.deps import get_current_user

router = APIRouter(prefix="/profiles", tags=["profiles"])

@router.get("", response_model=List[ManagedProfileOut])
def list_managed_profiles(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ManagedProfile).filter(ManagedProfile.manager_user_id == user.id).all()

@router.post("", response_model=ManagedProfileOut)
def create_managed_profile(payload: ManagedProfileCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    clean_name = (payload.name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Person name cannot be empty.")
    profile = ManagedProfile(
        manager_user_id=user.id,
        name=clean_name,
        avatar_emoji=(payload.avatar_emoji or "🎁").strip() or "🎁",
        notes=payload.notes.strip() if payload.notes and payload.notes.strip() else None,
        birth_date=payload.birth_date,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile

@router.patch("/{profile_id}", response_model=ManagedProfileOut)
def update_managed_profile(
    profile_id: int,
    payload: ManagedProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(ManagedProfile).filter(
        ManagedProfile.id == profile_id,
        ManagedProfile.manager_user_id == user.id,
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Person name cannot be empty.")
        profile.name = clean_name
    if payload.avatar_emoji is not None:
        profile.avatar_emoji = payload.avatar_emoji.strip() or "🎁"
    if payload.notes is not None:
        profile.notes = payload.notes.strip() or None
    if payload.birth_date is not None:
        profile.birth_date = payload.birth_date

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
