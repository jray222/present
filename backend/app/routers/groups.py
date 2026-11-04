import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import FamilyGroup, GroupMember, User, Wishlist
from app.deps import get_current_user
from app.config import settings

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
        name = m.user.full_name or m.user.username if m.user else "Member"
        username = m.user.username if m.user else ""
        color = m.user.avatar_color if m.user else "emerald"
        totp = m.user.totp_enabled if m.user else False
        members.append(GroupMemberOut(
            user_id=m.user_id,
            name=name,
            username=username,
            role=m.role,
            avatar_color=color,
            totp_enabled=totp,
        ))
    return GroupOut(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        invite_url=f"{settings.PUBLIC_URL}/join/{group.invite_code}",
        role=user_role,
        members_count=len(group.members),
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

@router.post("/{group_id}/admin/reset-member-2fa")
def admin_reset_member_2fa(
    group_id: int,
    payload: ResetMember2FARequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify requesting user is admin or owner of this group (or superuser)
    my_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user.id,
    ).first()
    if not user.is_superuser and (not my_membership or my_membership.role not in ("admin", "owner")):
        raise HTTPException(status_code=403, detail="Group admin privileges required.")

    # Target member
    target_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == payload.user_id,
    ).first()
    if not target_membership:
        raise HTTPException(status_code=404, detail="Target user is not a member of this family group.")

    target_user = target_membership.user
    target_user.totp_enabled = False
    target_user.totp_secret_encrypted = None
    from app.models import BackupCode
    db.query(BackupCode).filter(BackupCode.user_id == target_user.id).delete()
    db.commit()

    return {"status": "2fa_reset_success", "username": target_user.username}

@router.post("/{group_id}/admin/reset-member-password")
def admin_reset_member_password(
    group_id: int,
    payload: ResetMemberPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    my_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user.id,
    ).first()
    if not user.is_superuser and (not my_membership or my_membership.role not in ("admin", "owner")):
        raise HTTPException(status_code=403, detail="Group admin privileges required.")

    target_membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == payload.user_id,
    ).first()
    if not target_membership:
        raise HTTPException(status_code=404, detail="Target user is not a member of this family group.")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    from app.security import hash_password
    target_user = target_membership.user
    target_user.password_hash = hash_password(payload.new_password)
    from datetime import datetime, timezone
    target_user.password_changed_at = datetime.now(timezone.utc)
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
