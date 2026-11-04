from typing import List, Optional
from pydantic import BaseModel, EmailStr

class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_color: str
    avatar_url: Optional[str] = None
    is_active: bool
    is_superuser: bool
    totp_enabled: bool
    is_google_user: bool = False
    requires_2fa_setup: bool = False
    has_passkey: bool = False

    class Config:
        from_attributes = True

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_color: Optional[str] = "emerald"

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TwoFactorVerifyRequest(BaseModel):
    temp_token: str
    code: str

class ManagedProfileCreate(BaseModel):
    name: str
    avatar_emoji: Optional[str] = "🧸"
    notes: Optional[str] = None
    birth_date: Optional[str] = None

class ManagedProfileOut(BaseModel):
    id: int
    manager_user_id: int
    name: str
    avatar_emoji: str
    notes: Optional[str] = None
    birth_date: Optional[str] = None

    class Config:
        from_attributes = True

class WishlistItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = "USD"
    priority: Optional[int] = 1
    desired_quantity: Optional[int] = 1

class WishlistItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    priority: Optional[int] = None
    desired_quantity: Optional[int] = None

class ItemClaimOut(BaseModel):
    id: int
    item_id: int
    claimed_by_user_id: Optional[int] = None
    claimed_by_name: str
    status: str  # reserved, purchased
    is_own_claim: bool = False
    reserved_at: Optional[str] = None
    purchased_at: Optional[str] = None

class WishlistItemOut(BaseModel):
    id: int
    wishlist_id: int
    title: str
    description: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    currency: str
    priority: int
    desired_quantity: int
    # Anti-spoiler: claims populated only for family/guests, never for list recipient
    claims: List[ItemClaimOut] = []
    is_claimed: bool = False
    claim_status: Optional[str] = None  # None, "reserved", "purchased"

    class Config:
        from_attributes = True

class WishlistCreate(BaseModel):
    title: str
    description: Optional[str] = None
    occasion: Optional[str] = "Christmas"
    icon: Optional[str] = "🎁"
    view_mode: Optional[str] = "grid"
    managed_profile_id: Optional[int] = None

class WishlistUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    occasion: Optional[str] = None
    icon: Optional[str] = None
    view_mode: Optional[str] = None

class WishlistOut(BaseModel):
    id: int
    user_id: int
    managed_profile_id: Optional[int] = None
    managed_profile_name: Optional[str] = None
    owner_name: str
    title: str
    description: Optional[str] = None
    occasion: str
    icon: str
    view_mode: str
    is_owner: bool = False
    items: List[WishlistItemOut] = []

    class Config:
        from_attributes = True

class ClaimActionRequest(BaseModel):
    status: str  # "reserved" or "purchased"
    guest_name: Optional[str] = None  # for grandparents / token guests

class BatchClaimRequest(BaseModel):
    item_ids: List[int]
    status: str = "reserved"
    guest_name: Optional[str] = None

class BatchClaimResponse(BaseModel):
    updated_items: List[WishlistItemOut]
    count: int

class ScrapeRequest(BaseModel):
    url: str

class ScrapeResponse(BaseModel):
    title: str
    description: str
    image_url: str
    price: Optional[float] = None
    currency: str
    vendor: str
    clean_url: Optional[str] = None
