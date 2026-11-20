import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import BackupCode, FamilyGroup, GroupMember, RefreshToken, User, Wishlist
from app.deps import get_current_user
from app.config import settings
from app.services.preferences import parse_gift_preferences

router = APIRouter(prefix="/groups", tags=["groups"])

class CreateGroupRequest(BaseModel):
    name: str

class JoinGroupRequest(BaseModel):
    invite_code: str

class GroupMemberOut(BaseModel):
    user_id: int
    name: str
    username: str
    role: str
    avatar_color: str
    totp_enabled: bool = False
    has_preferences: bool = False
    preferences_filled_count: int = 0

class ResetMember2FARequest(BaseModel):
    user_id: int

class ResetMemberPasswordRequest(BaseModel):
    user_id: int
    new_password: str

class GroupOut(BaseModel):
    id: int
    name: str
    invite_code: str
    invite_url: str
    role: str
    members_count: int
    members: List[GroupMemberOut] = []

def _format_group(group: FamilyGroup, user_role: str) -> GroupOut:
    members = []
    for m in group.members:
        if not m.user or not m.user.is_active:
            continue
        name = m.user.full_name or m.user.username
        username = m.user.username
        color = m.user.avatar_color
        totp = m.user.totp_enabled
        parsed_prefs = parse_gift_preferences(m.user.gift_preferences_json)
        members.append(GroupMemberOut(
            user_id=m.user_id,
            name=name,
            username=username,
            role=m.role,
            avatar_color=color,
            totp_enabled=totp,
            has_preferences=parsed_prefs["has_preferences"],
            preferences_filled_count=parsed_prefs["filled_count"],
        ))
    return GroupOut(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        invite_url=f"{settings.PUBLIC_URL}/join/{group.invite_code}",
        role=user_role,
        members_count=len(members),
        members=members,
    )

@router.get("", response_model=List[GroupOut])
def list_my_groups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = []
    for m in user.group_memberships:
        result.append(_format_group(m.group, m.role))
    return result

@router.post("", response_model=GroupOut)
def create_group(payload: CreateGroupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = secrets.token_urlsafe(6).upper().replace("_", "").replace("-", "")
    group = FamilyGroup(
        name=payload.name.strip(),
        invite_code=code,
        created_by_user_id=user.id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    membership = GroupMember(
        group_id=group.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)
    db.commit()
    db.refresh(group)
    return _format_group(group, "owner")

@router.post("/join", response_model=GroupOut)
def join_group(payload: JoinGroupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = payload.invite_code.strip().upper()
    group = db.query(FamilyGroup).filter(FamilyGroup.invite_code == code).first()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid invite code.")

    existing = db.query(GroupMember).filter(
        GroupMember.group_id == group.id,
        GroupMember.user_id == user.id,
    ).first()
    if existing:
        return _format_group(group, existing.role)

    membership = GroupMember(
        group_id=group.id,
        user_id=user.id,
        role="member",
    )
    db.add(membership)
    db.commit()
    db.refresh(group)
    return _format_group(group, "member")

def _authorize_group_member_reset(
    group_id: int,
    target_user_id: int,
    user: User,
    db: Session,
) -> User:
    my_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user.id,
    ).first()
    if not user.is_superuser and (not my_membership or my_membership.role not in ("admin", "owner")):
        raise HTTPException(status_code=403, detail="Group admin privileges required.")

    target_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == target_user_id,
    ).first()
    if not target_membership or not target_membership.user:
        raise HTTPException(status_code=404, detail="Target user is not a member of this family group.")

    target_user = target_membership.user
    if target_user.id == user.id:
        raise HTTPException(status_code=400, detail="Use account settings to manage your own credentials.")

    if target_user.is_superuser and not user.is_superuser:
        raise HTTPException(status_code=403, detail="Cannot reset credentials for a system superuser.")

    if not user.is_superuser and my_membership and my_membership.role == "admin" and target_membership.role in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient group role hierarchy to reset this member.")

    return target_user


@router.post("/{group_id}/admin/reset-member-2fa")
def admin_reset_member_2fa(
    group_id: int,
    payload: ResetMember2FARequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_user = _authorize_group_member_reset(group_id, payload.user_id, user, db)
    target_user.totp_enabled = False
    target_user.totp_secret_encrypted = None
    target_user.token_version = (target_user.token_version or 0) + 1
    db.query(BackupCode).filter(BackupCode.user_id == target_user.id).delete()
    db.query(RefreshToken).filter(
        RefreshToken.user_id == target_user.id,
        RefreshToken.revoked == False,
    ).update({"revoked": True})
    db.commit()

    return {"status": "2fa_reset_success", "username": target_user.username}

@router.post("/{group_id}/admin/reset-member-password")
def admin_reset_member_password(
    group_id: int,
    payload: ResetMemberPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_user = _authorize_group_member_reset(group_id, payload.user_id, user, db)

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    from app.security import hash_password
    from datetime import datetime, timezone
    target_user.password_hash = hash_password(payload.new_password)
    target_user.password_changed_at = datetime.now(timezone.utc)
    target_user.token_version = (target_user.token_version or 0) + 1
    db.query(RefreshToken).filter(
        RefreshToken.user_id == target_user.id,
        RefreshToken.revoked == False,
    ).update({"revoked": True})
    db.commit()

    return {"status": "password_reset_success", "username": target_user.username}

@router.delete("/{group_id}/leave")
def leave_group(group_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found.")

    db.delete(membership)
    db.commit()
    return {"status": "left_group"}
