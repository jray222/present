from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_current_user
from app.models import GroupMember, ManagedProfile, User
from app.schemas import (
    GiftPreferenceCategoryOut,
    GiftPreferencesOut,
    GiftPreferencesUpdate,
    PersonPreferencesOut,
)
from app.services.preferences import (
    GIFT_PREFERENCE_CATEGORIES,
    parse_gift_preferences,
    serialize_gift_preferences,
    users_share_family_group,
)

router = APIRouter(prefix="/preferences", tags=["preferences"])


def _format_user_preferences(target: User, viewer: User) -> PersonPreferencesOut:
    parsed = parse_gift_preferences(target.gift_preferences_json)
    is_self = target.id == viewer.id
    return PersonPreferencesOut(
        person_type="user",
        person_id=target.id,
        name=target.full_name or target.username,
        username=target.username,
        avatar_color=target.avatar_color,
        is_self=is_self,
        is_editable=is_self,
        preferences=GiftPreferencesOut(**parsed),
    )


def _format_profile_preferences(profile: ManagedProfile, viewer: User) -> PersonPreferencesOut:
    parsed = parse_gift_preferences(profile.gift_preferences_json)
    manager_name = (
        profile.manager.full_name or profile.manager.username
        if profile.manager
        else None
    )
    is_editable = profile.manager_user_id == viewer.id or viewer.is_superuser
    return PersonPreferencesOut(
        person_type="managed_profile",
        person_id=profile.id,
        name=profile.name,
        manager_name=manager_name,
        avatar_emoji=profile.avatar_emoji or "🧸",
        is_self=False,
        is_editable=is_editable,
        preferences=GiftPreferencesOut(**parsed),
    )


@router.get("/categories", response_model=List[GiftPreferenceCategoryOut])
def get_preference_categories():
    return [GiftPreferenceCategoryOut(**c) for c in GIFT_PREFERENCE_CATEGORIES]


@router.get("/me", response_model=PersonPreferencesOut)
def get_my_preferences(user: User = Depends(get_current_user)):
    return _format_user_preferences(user, user)


@router.put("/me", response_model=PersonPreferencesOut)
def update_my_preferences(
    payload: GiftPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        user.gift_preferences_json = serialize_gift_preferences(
            payload.categories, payload.notes, payload.conflicts
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    db.refresh(user)
    return _format_user_preferences(user, user)


@router.get("/family", response_model=List[PersonPreferencesOut])
def list_family_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group_ids = [m.group_id for m in user.group_memberships]

    if group_ids:
        member_user_ids = {
            row[0]
            for row in db.query(GroupMember.user_id)
            .filter(GroupMember.group_id.in_(group_ids))
            .all()
        }
        member_user_ids.add(user.id)
    else:
        member_user_ids = {user.id}

    users = (
        db.query(User)
        .filter(User.id.in_(member_user_ids), User.is_active == True)
        .order_by(User.id.asc())
        .all()
    )
    profiles = (
        db.query(ManagedProfile)
        .join(ManagedProfile.manager)
        .filter(ManagedProfile.manager_user_id.in_(member_user_ids), User.is_active == True)
        .order_by(ManagedProfile.id.asc())
        .all()
    )

    results: List[PersonPreferencesOut] = []

    # 1. Self first
    results.append(_format_user_preferences(user, user))

    # 2. Self's managed profiles next
    for p in profiles:
        if p.manager_user_id == user.id:
            results.append(_format_profile_preferences(p, user))

    # 3. Other family members (sorted alphabetically by display name)
    other_users = sorted(
        [u for u in users if u.id != user.id],
        key=lambda u: (u.full_name or u.username).lower(),
    )
    for u in other_users:
        results.append(_format_user_preferences(u, user))

    # 4. Other family members' managed profiles (sorted alphabetically by name)
    other_profiles = sorted(
        [p for p in profiles if p.manager_user_id != user.id],
        key=lambda p: p.name.lower(),
    )
    for p in other_profiles:
        results.append(_format_profile_preferences(p, user))

    return results


@router.get("/users/{user_id}", response_model=PersonPreferencesOut)
def get_user_preferences(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    if not user.is_superuser and not users_share_family_group(db, user.id, target.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not share a family group with this person.",
        )

    return _format_user_preferences(target, user)


@router.get("/profiles/{profile_id}", response_model=PersonPreferencesOut)
def get_profile_preferences(
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(ManagedProfile)
        .join(ManagedProfile.manager)
        .filter(ManagedProfile.id == profile_id, User.is_active == True)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    if not user.is_superuser and not users_share_family_group(
        db, user.id, profile.manager_user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not share a family group with this person.",
        )

    return _format_profile_preferences(profile, user)


@router.put("/profiles/{profile_id}", response_model=PersonPreferencesOut)
def update_profile_preferences(
    profile_id: int,
    payload: GiftPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(ManagedProfile).filter(ManagedProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    if profile.manager_user_id != user.id and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the profile manager can edit these gift preferences.",
        )

    try:
        profile.gift_preferences_json = serialize_gift_preferences(
            payload.categories, payload.notes, payload.conflicts
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    db.refresh(profile)
    return _format_profile_preferences(profile, user)
