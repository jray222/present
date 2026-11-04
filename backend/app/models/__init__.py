from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Numeric, LargeBinary
)
from sqlalchemy.orm import relationship
from app.database import Base

def _utcnow():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    full_name = Column(String(128), nullable=True)
    avatar_color = Column(String(32), default="emerald", nullable=False)

    password_hash = Column(String(255), nullable=True)
    password_changed_at = Column(DateTime, default=_utcnow)

    # Google OAuth
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    avatar_url = Column(String(512), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)

    # TOTP 2FA
    totp_secret_encrypted = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    totp_confirmed_at = Column(DateTime, nullable=True)
    totp_last_used_step = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    passkeys = relationship("PasskeyCredential", back_populates="user", cascade="all, delete-orphan")
    backup_codes = relationship("BackupCode", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    managed_profiles = relationship("ManagedProfile", back_populates="manager", cascade="all, delete-orphan")
    wishlists = relationship("Wishlist", back_populates="user", foreign_keys="Wishlist.user_id", cascade="all, delete-orphan")
    group_memberships = relationship("GroupMember", back_populates="user", cascade="all, delete-orphan")
    claims = relationship("ItemClaim", back_populates="claimed_by_user", foreign_keys="ItemClaim.claimed_by_user_id")

class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    credential_id = Column(String(255), unique=True, nullable=False, index=True)
    public_key = Column(LargeBinary, nullable=False)
    sign_count = Column(Integer, default=0, nullable=False)
    name = Column(String(128), nullable=False, default="Passkey")
    transports = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="passkeys")

class BackupCode(Base):
    __tablename__ = "backup_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    user = relationship("User", back_populates="backup_codes")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=_utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    user_agent = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")

class ManagedProfile(Base):
    """Profiles for dependents/children who don't have separate accounts."""
    __tablename__ = "managed_profiles"

    id = Column(Integer, primary_key=True, index=True)
    manager_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    avatar_emoji = Column(String(16), default="🧸", nullable=False)
    notes = Column(String(255), nullable=True)
    birth_date = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    manager = relationship("User", back_populates="managed_profiles")
    wishlists = relationship("Wishlist", back_populates="managed_profile", cascade="all, delete-orphan")

class FamilyGroup(Base):
    """Sharing circle (e.g. 'The Miller Family')."""
    __tablename__ = "family_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    invite_code = Column(String(32), unique=True, nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    secret_santa_draws = relationship("SecretSantaDraw", back_populates="group", cascade="all, delete-orphan")

class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("family_groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(32), default="member", nullable=False)  # owner, admin, member
    joined_at = Column(DateTime, default=_utcnow)

    group = relationship("FamilyGroup", back_populates="members")
    user = relationship("User", back_populates="group_memberships")

class Wishlist(Base):
    __tablename__ = "wishlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    managed_profile_id = Column(Integer, ForeignKey("managed_profiles.id"), nullable=True, index=True)
    title = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    occasion = Column(String(64), default="Christmas", nullable=False)  # Christmas, Birthday, General, Baby, Wedding
    icon = Column(String(16), default="🎁", nullable=False)
    view_mode = Column(String(16), default="grid", nullable=False)  # grid, compact
    is_public = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    user = relationship("User", back_populates="wishlists", foreign_keys=[user_id])
    managed_profile = relationship("ManagedProfile", back_populates="wishlists")
    items = relationship("WishlistItem", back_populates="wishlist", cascade="all, delete-orphan", order_by="WishlistItem.priority.desc(), WishlistItem.id.asc()")
    share_tokens = relationship("WishlistShareToken", back_populates="wishlist", cascade="all, delete-orphan")

class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    wishlist_id = Column(Integer, ForeignKey("wishlists.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(8), default="USD", nullable=False)
    priority = Column(Integer, default=1, nullable=False)  # 1=Nice to have, 2=Love this, 3=Most wanted
    desired_quantity = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    wishlist = relationship("Wishlist", back_populates="items")
    claims = relationship("ItemClaim", back_populates="item", cascade="all, delete-orphan")

class ItemClaim(Base):
    """
    Secret reservation/purchase tracking.
    When wishlist owner queries their list, claims are completely filtered out on backend.
    """
    __tablename__ = "item_claims"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("wishlist_items.id"), nullable=False, index=True)
    claimed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    guest_buyer_name = Column(String(128), nullable=True)  # For grandparents / token guests
    status = Column(String(32), default="reserved", nullable=False)  # reserved, purchased
    quantity = Column(Integer, default=1, nullable=False)
    note = Column(String(255), nullable=True)
    reserved_at = Column(DateTime, default=_utcnow)
    purchased_at = Column(DateTime, nullable=True)

    item = relationship("WishlistItem", back_populates="claims")
    claimed_by_user = relationship("User", back_populates="claims", foreign_keys=[claimed_by_user_id])

class WishlistShareToken(Base):
    """Frictionless 'Grandparent Mode' token."""
    __tablename__ = "wishlist_share_tokens"

    id = Column(Integer, primary_key=True, index=True)
    wishlist_id = Column(Integer, ForeignKey("wishlists.id"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    label = Column(String(128), default="Family Link", nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    wishlist = relationship("Wishlist", back_populates="share_tokens")

class SecretSantaDraw(Base):
    __tablename__ = "secret_santa_draws"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("family_groups.id"), nullable=False, index=True)
    title = Column(String(128), nullable=False)
    budget_limit = Column(Numeric(10, 2), nullable=True)
    exchange_date = Column(String(32), nullable=True)
    rules_notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    group = relationship("FamilyGroup", back_populates="secret_santa_draws")
    pairs = relationship("SecretSantaPair", back_populates="draw", cascade="all, delete-orphan")

class SecretSantaPair(Base):
    __tablename__ = "secret_santa_pairs"

    id = Column(Integer, primary_key=True, index=True)
    draw_id = Column(Integer, ForeignKey("secret_santa_draws.id"), nullable=False, index=True)
    giver_name = Column(String(128), nullable=False)
    giver_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    receiver_name = Column(String(128), nullable=False)
    receiver_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    view_token = Column(String(64), unique=True, nullable=False, index=True)
    viewed_at = Column(DateTime, nullable=True)

    draw = relationship("SecretSantaDraw", back_populates="pairs")

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)

