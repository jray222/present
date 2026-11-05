from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import secrets
from app.database import get_db
from app.models import Wishlist, WishlistItem, ItemClaim, ManagedProfile, WishlistShareToken, User, SystemSetting, GroupMember
from app.schemas import (
    WishlistCreate, WishlistUpdate, WishlistOut,
    WishlistItemCreate, WishlistItemUpdate, WishlistItemOut, ItemClaimOut,
    ScrapeRequest, ScrapeResponse, ItemReorderRequest
)
from app.deps import get_current_user, get_current_user_optional
from app.services.scraper import scrape_product_url
from app.config import settings

router = APIRouter(prefix="/wishlists", tags=["wishlists"])

def _format_item_for_viewer(item: WishlistItem, viewer: Optional[User]) -> WishlistItemOut:
    # Anti-spoiler logic:
    # If the viewer is the owner of the wishlist, or the parent managing the child's wishlist:
    # Claims are strictly hidden!
    is_owner = False
    if viewer:
        if item.wishlist.user_id == viewer.id:
            is_owner = True
        elif item.wishlist.managed_profile and item.wishlist.managed_profile.manager_user_id == viewer.id:
            is_owner = True

    claims_out = []
    claim_status = None
    is_claimed = False

    if is_owner:
        claims = item.claims
        owner_claims = [c for c in claims if c.claimed_by_user_id == viewer.id]
        if owner_claims:
            is_claimed = True
            latest = owner_claims[-1]
            claim_status = latest.status
            for c in owner_claims:
                needs_reminder = False
                if c.status == "reserved" and c.reserved_at:
                    res_at = c.reserved_at if c.reserved_at.tzinfo else c.reserved_at.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) - res_at >= timedelta(days=7):
                        needs_reminder = True
                claims_out.append(ItemClaimOut(
                    id=c.id,
                    item_id=c.item_id,
                    claimed_by_user_id=c.claimed_by_user_id,
                    claimed_by_name="You (Reserved)",
                    status=c.status,
                    is_own_claim=True,
                    needs_purchase_reminder=needs_reminder,
                    reserved_at=c.reserved_at.isoformat() if c.reserved_at else None,
                    purchased_at=c.purchased_at.isoformat() if c.purchased_at else None,
                ))
    else:
        # Viewer is someone else (family, friend, guest)
        claims = item.claims
        if claims:
            is_claimed = True
            latest = claims[-1]
            claim_status = latest.status
            for c in claims:
                is_own = bool(viewer and c.claimed_by_user_id == viewer.id)
                needs_reminder = False
                if c.status == "reserved" and c.reserved_at:
                    res_at = c.reserved_at if c.reserved_at.tzinfo else c.reserved_at.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) - res_at >= timedelta(days=7):
                        needs_reminder = True
                name = c.guest_buyer_name or (c.claimed_by_user.full_name or c.claimed_by_user.username if c.claimed_by_user else "Someone")
                claims_out.append(ItemClaimOut(
                    id=c.id,
                    item_id=c.item_id,
                    claimed_by_user_id=c.claimed_by_user_id,
                    claimed_by_name=name,
                    status=c.status,
                    is_own_claim=is_own,
                    needs_purchase_reminder=needs_reminder,
                    reserved_at=c.reserved_at.isoformat() if c.reserved_at else None,
                    purchased_at=c.purchased_at.isoformat() if c.purchased_at else None,
                ))

    return WishlistItemOut(
        id=item.id,
        wishlist_id=item.wishlist_id,
        title=item.title,
        description=item.description,
        url=item.url,
        image_url=item.image_url,
        price=float(item.price) if item.price else None,
        currency=item.currency,
        priority=item.priority,
        desired_quantity=item.desired_quantity,
        sort_order=item.sort_order if hasattr(item, "sort_order") else 0,
        claims=claims_out,
        is_claimed=is_claimed,
        claim_status=claim_status,
    )

def _format_wishlist_out(wl: Wishlist, viewer: Optional[User]) -> WishlistOut:
    is_owner = bool(viewer and (wl.user_id == viewer.id or (wl.managed_profile and wl.managed_profile.manager_user_id == viewer.id)))
    items_out = [_format_item_for_viewer(i, viewer) for i in wl.items]
    managed_name = wl.managed_profile.name if wl.managed_profile else None
    owner_name = wl.user.full_name or wl.user.username

    return WishlistOut(
        id=wl.id,
        user_id=wl.user_id,
        managed_profile_id=wl.managed_profile_id,
        managed_profile_name=managed_name,
        owner_name=owner_name,
        title=wl.title,
        description=wl.description,
        occasion=wl.occasion,
        icon=wl.icon,
        view_mode=wl.view_mode,
        is_owner=is_owner,
        is_archived=getattr(wl, "is_archived", False),
        items=items_out,
    )

@router.get("", response_model=List[WishlistOut])
def list_my_wishlists(
    profile_id: Optional[int] = Query(None),
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Wishlist).filter(Wishlist.user_id == user.id)
    if not include_archived:
        query = query.filter(Wishlist.is_archived == False)

    if profile_id is not None:
        query = query.filter(Wishlist.managed_profile_id == profile_id)
    else:
        # Default returns user's own (non-child) lists unless specified
        query = query.filter(Wishlist.managed_profile_id == None)
    return [_format_wishlist_out(wl, user) for wl in query.all()]

@router.get("/all-family", response_model=List[WishlistOut])
def list_family_wishlists(
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # All wishlists in groups where current user is a member, plus own wishlists
    groups = [m.group_id for m in user.group_memberships]
    query = db.query(Wishlist)
    if not include_archived:
        query = query.filter(Wishlist.is_archived == False)

    if groups:
        family_user_ids = [row[0] for row in db.query(GroupMember.user_id).filter(GroupMember.group_id.in_(groups)).all()]
        wls = query.filter(Wishlist.user_id.in_(family_user_ids)).all()
    else:
        wls = query.filter(Wishlist.user_id == user.id).all()
    return [_format_wishlist_out(wl, user) for wl in wls]

@router.post("", response_model=WishlistOut)
def create_wishlist(payload: WishlistCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.managed_profile_id:
        profile = db.query(ManagedProfile).filter(
            ManagedProfile.id == payload.managed_profile_id,
            ManagedProfile.manager_user_id == user.id,
        ).first()
        if not profile:
            raise HTTPException(status_code=404, detail="Child profile not found.")

    wl = Wishlist(
        user_id=user.id,
        managed_profile_id=payload.managed_profile_id,
        title=payload.title.strip(),
        description=payload.description,
        occasion=payload.occasion or "Christmas",
        icon=payload.icon or "🎁",
        view_mode=payload.view_mode or "grid",
        is_archived=False,
    )
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _format_wishlist_out(wl, user)

@router.get("/{wishlist_id}", response_model=WishlistOut)
def get_wishlist(
    wishlist_id: int,
    token: Optional[str] = Query(None, description="Optional share token for guest access"),
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found.")

    # 1. Share token check
    if token:
        st = db.query(WishlistShareToken).filter(
            WishlistShareToken.wishlist_id == wl.id,
            WishlistShareToken.token == token
        ).first()
        if st:
            return _format_wishlist_out(wl, viewer=None)

    # 2. Authenticated user access check
    if user:
        # Owner of wishlist
        if wl.user_id == user.id:
            return _format_wishlist_out(wl, user)
        # Managing parent of child profile
        if wl.managed_profile and wl.managed_profile.manager_user_id == user.id:
            return _format_wishlist_out(wl, user)

        # Check shared group membership
        user_group_ids = [m.group_id for m in user.group_memberships]
        if user_group_ids:
            shared_group = db.query(GroupMember).filter(
                GroupMember.user_id == wl.user_id,
                GroupMember.group_id.in_(user_group_ids)
            ).first()
            if shared_group:
                return _format_wishlist_out(wl, user)

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not share a group with the owner of this wishlist."
        )

    # Unauthenticated without token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication or a valid share token is required to view this wishlist."
    )

@router.patch("/{wishlist_id}", response_model=WishlistOut)
def update_wishlist(wishlist_id: int, payload: WishlistUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id, Wishlist.user_id == user.id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found or unauthorized.")

    if payload.title is not None:
        wl.title = payload.title.strip()
    if payload.description is not None:
        wl.description = payload.description
    if payload.occasion is not None:
        wl.occasion = payload.occasion
    if payload.icon is not None:
        wl.icon = payload.icon
    if payload.view_mode is not None:
        wl.view_mode = payload.view_mode
    if payload.is_archived is not None:
        wl.is_archived = payload.is_archived

    db.commit()
    db.refresh(wl)
    return _format_wishlist_out(wl, user)

@router.delete("/{wishlist_id}")
def delete_wishlist(wishlist_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id, Wishlist.user_id == user.id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found or unauthorized.")
    db.delete(wl)
    db.commit()
    return {"status": "deleted"}

@router.post("/{wishlist_id}/reorder")
def reorder_items(
    wishlist_id: int,
    payload: ItemReorderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id, Wishlist.user_id == user.id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found or unauthorized.")

    for index, item_id in enumerate(payload.item_ids):
        db.query(WishlistItem).filter(
            WishlistItem.id == item_id,
            WishlistItem.wishlist_id == wl.id
        ).update({"sort_order": index})

    db.commit()
    return {"status": "reordered", "count": len(payload.item_ids)}

# --- Item Endpoints ---

@router.post("/{wishlist_id}/items", response_model=WishlistItemOut)
def add_item_to_wishlist(wishlist_id: int, payload: WishlistItemCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id, Wishlist.user_id == user.id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found or unauthorized.")

    # Calculate next sort order
    max_order = db.query(WishlistItem).filter(WishlistItem.wishlist_id == wl.id).count()

    item = WishlistItem(
        wishlist_id=wl.id,
        title=payload.title.strip(),
        description=payload.description,
        url=payload.url,
        image_url=payload.image_url,
        price=payload.price,
        currency=payload.currency or "USD",
        priority=payload.priority or 1,
        desired_quantity=payload.desired_quantity or 1,
        sort_order=payload.sort_order if payload.sort_order is not None else max_order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _format_item_for_viewer(item, user)

@router.patch("/items/{item_id}", response_model=WishlistItemOut)
def update_wishlist_item(item_id: int, payload: WishlistItemUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(WishlistItem).filter(WishlistItem.id == item_id).first()
    if not item or item.wishlist.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found or unauthorized.")

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.description is not None:
        item.description = payload.description
    if payload.url is not None:
        item.url = payload.url
    if payload.image_url is not None:
        item.image_url = payload.image_url
    if payload.price is not None:
        item.price = payload.price
    if payload.currency is not None:
        item.currency = payload.currency
    if payload.priority is not None:
        item.priority = payload.priority
    if payload.desired_quantity is not None:
        item.desired_quantity = payload.desired_quantity
    if payload.sort_order is not None:
        item.sort_order = payload.sort_order

    db.commit()
    db.refresh(item)
    return _format_item_for_viewer(item, user)

@router.delete("/items/{item_id}")
def delete_wishlist_item(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(WishlistItem).filter(WishlistItem.id == item_id).first()
    if not item or item.wishlist.user_id != user.id:
        raise HTTPException(status_code=404, detail="Item not found or unauthorized.")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}

# --- Sharing & Magic Link Tokens (Grandparent Mode) ---

@router.post("/{wishlist_id}/share-token")
def create_share_token(wishlist_id: int, request: Request, label: str = "Family Link", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wl = db.query(Wishlist).filter(Wishlist.id == wishlist_id, Wishlist.user_id == user.id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Wishlist not found.")

    token = secrets.token_urlsafe(16)
    share = WishlistShareToken(
        wishlist_id=wl.id,
        token=token,
        label=label,
    )
    db.add(share)
    db.commit()

    # Determine base url: check SystemSetting first, then request Host, fallback to PUBLIC_URL
    setting = db.query(SystemSetting).filter(SystemSetting.key == "public_url").first()
    if setting and setting.value:
        base_url = setting.value.rstrip("/")
    else:
        base_url = settings.PUBLIC_URL
        host = request.headers.get("host")
        if host and "localhost" in base_url:
            scheme = request.url.scheme
            base_url = f"{scheme}://{host}"

    return {"token": token, "url": f"{base_url}/shared/{token}"}

@router.get("/shared-token/{token}", response_model=WishlistOut)
def get_shared_wishlist_by_token(token: str, db: Session = Depends(get_db)):
    record = db.query(WishlistShareToken).filter(WishlistShareToken.token == token).first()
    if not record:
        raise HTTPException(status_code=404, detail="Shared link expired or invalid.")
    return _format_wishlist_out(record.wishlist, viewer=None)

# --- Scraping Endpoint ---

@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_url(payload: ScrapeRequest):
    data = await scrape_product_url(payload.url.strip())
    return ScrapeResponse(
        title=data.get("title") or "",
        description=data.get("description") or "",
        image_url=data.get("image_url") or "",
        price=data.get("price"),
        currency=data.get("currency") or "USD",
        vendor=data.get("vendor") or "",
        clean_url=data.get("clean_url") or payload.url.strip(),
    )
