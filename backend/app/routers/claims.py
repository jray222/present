from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Optional
from app.database import get_db
from app.models import ItemClaim, WishlistItem, User
from app.schemas import ClaimActionRequest, WishlistItemOut, BatchClaimRequest, BatchClaimResponse
from app.deps import get_current_user, get_current_user_optional
from app.routers.wishlists import _format_item_for_viewer

router = APIRouter(prefix="/claims", tags=["claims"])

@router.post("/items/{item_id}", response_model=WishlistItemOut)
def claim_or_update_item(
    item_id: int,
    payload: ClaimActionRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    item = db.query(WishlistItem).filter(WishlistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    is_owner = bool(user and item.wishlist.user_id == user.id)

    # Check existing claim
    existing = db.query(ItemClaim).filter(ItemClaim.item_id == item_id).first()

    status = payload.status.lower()
    if status not in ("reserved", "purchased"):
        raise HTTPException(status_code=400, detail="Status must be 'reserved' or 'purchased'.")

    guest_name = payload.guest_name.strip() if payload.guest_name else None
    if not user and not guest_name:
        raise HTTPException(status_code=400, detail="Please enter your name (e.g. 'Grandma Linda') to reserve this gift.")

    if existing:
        # Check ownership of claim
        is_my_claim = False
        if user and existing.claimed_by_user_id == user.id:
            is_my_claim = True
        elif not user and existing.guest_buyer_name and guest_name and existing.guest_buyer_name.lower() == guest_name.lower():
            is_my_claim = True

        if not is_my_claim:
            claimed_by = existing.guest_buyer_name or (existing.claimed_by_user.full_name if existing.claimed_by_user else "Someone")
            raise HTTPException(status_code=409, detail=f"This item has already been {existing.status} by {claimed_by}.")

        # Update own claim status (e.g. from reserved -> purchased)
        existing.status = status
        if status == "purchased" and not existing.purchased_at:
            existing.purchased_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(item)
        return _format_item_for_viewer(item, user)

    # New claim
    final_guest_name = guest_name or ("Reserved by owner" if is_owner else None)
    claim = ItemClaim(
        item_id=item_id,
        claimed_by_user_id=user.id if user else None,
        guest_buyer_name=final_guest_name,
        status=status,
        reserved_at=datetime.now(timezone.utc),
        purchased_at=datetime.now(timezone.utc) if status == "purchased" else None,
    )
    db.add(claim)
    db.commit()
    db.refresh(item)
    return _format_item_for_viewer(item, user)

@router.post("/batch", response_model=BatchClaimResponse)
def batch_claim_items(
    payload: BatchClaimRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    status = payload.status.lower()
    if status not in ("reserved", "purchased"):
        raise HTTPException(status_code=400, detail="Status must be 'reserved' or 'purchased'.")

    guest_name = payload.guest_name.strip() if payload.guest_name else None
    if not user and not guest_name:
        raise HTTPException(status_code=400, detail="Please enter your name to reserve items.")

    updated_items = []
    for item_id in payload.item_ids:
        item = db.query(WishlistItem).filter(WishlistItem.id == item_id).first()
        if not item:
            continue
        existing = db.query(ItemClaim).filter(ItemClaim.item_id == item_id).first()
        if existing:
            is_my_claim = False
            if user and existing.claimed_by_user_id == user.id:
                is_my_claim = True
            elif not user and existing.guest_buyer_name and guest_name and existing.guest_buyer_name.lower() == guest_name.lower():
                is_my_claim = True
            if is_my_claim:
                existing.status = status
                if status == "purchased" and not existing.purchased_at:
                    existing.purchased_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(item)
                updated_items.append(_format_item_for_viewer(item, user))
        else:
            is_owner = bool(user and item.wishlist.user_id == user.id)
            final_guest_name = guest_name or ("Reserved by owner" if is_owner else None)
            claim = ItemClaim(
                item_id=item_id,
                claimed_by_user_id=user.id if user else None,
                guest_buyer_name=final_guest_name,
                status=status,
                reserved_at=datetime.now(timezone.utc),
                purchased_at=datetime.now(timezone.utc) if status == "purchased" else None,
            )
            db.add(claim)
            db.commit()
            db.refresh(item)
            updated_items.append(_format_item_for_viewer(item, user))

    return BatchClaimResponse(updated_items=updated_items, count=len(updated_items))

@router.delete("/items/{item_id}", response_model=WishlistItemOut)
def release_claim(
    item_id: int,
    guest_name: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    item = db.query(WishlistItem).filter(WishlistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    claim = db.query(ItemClaim).filter(ItemClaim.item_id == item_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="No claim found for this item.")

    # Only claimer can release it
    is_my_claim = False
    if user and claim.claimed_by_user_id == user.id:
        is_my_claim = True
    elif not user and claim.guest_buyer_name and guest_name and claim.guest_buyer_name.lower() == guest_name.lower():
        is_my_claim = True

    if not is_my_claim:
        raise HTTPException(status_code=403, detail="You can only release items you claimed.")

    db.delete(claim)
    db.commit()
    db.refresh(item)
    return _format_item_for_viewer(item, user)

@router.get("/my-claims", response_model=List[WishlistItemOut])
def list_my_claimed_items(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The user's shopping bag of gifts they promised to buy."""
    claims = db.query(ItemClaim).filter(ItemClaim.claimed_by_user_id == user.id).all()
    items = [c.item for c in claims]
    return [_format_item_for_viewer(i, user) for i in items]
