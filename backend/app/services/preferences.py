import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.models import GroupMember

GIFT_PREFERENCE_CATEGORIES: List[Dict[str, str]] = [
    {
        "key": "coffee_tea_hot_chocolate",
        "label": "Coffee, Tea, Hot chocolate",
        "icon": "☕",
        "placeholder": "Favorite roasts, tea blends, hot cocoa flavors, decaf, creamers...",
    },
    {
        "key": "beauty_healthcare",
        "label": "Beauty, Healthcare",
        "icon": "🧴",
        "placeholder": "Hand lotions, skincare, bath salts, lip balm, unscented, etc.",
    },
    {
        "key": "sweet_treats",
        "label": "Sweet Treats",
        "icon": "🍫",
        "placeholder": "Dark or milk chocolate, cookies, candy, caramel, dietary notes...",
    },
    {
        "key": "alcohol",
        "label": "Alcohol",
        "icon": "🍷",
        "placeholder": "Favorite wine varietals, spirits, craft beer, mixers, or 'None'",
    },
    {
        "key": "snacks_condiments",
        "label": "Snacks, Condiments",
        "icon": "🥨",
        "placeholder": "Chips, nuts, jerky, hot sauce, olive oil, jams, spices...",
    },
    {
        "key": "candles_scents_diffusers",
        "label": "Candles, Scents, Diffusers",
        "icon": "🕯️",
        "placeholder": "Pine, vanilla, citrus, cedarwood, essential oils, or 'Unscented'",
    },
]

VALID_CATEGORY_KEYS = {c["key"] for c in GIFT_PREFERENCE_CATEGORIES}
MAX_CATEGORY_VALUE_LEN = 1000
MAX_NOTES_LEN = 2000
MAX_CONFLICTS = 50
MAX_CONFLICT_NAME_LEN = 128


def _clean_conflicts_list(raw_conflicts) -> List[str]:
    if not isinstance(raw_conflicts, list):
        return []
    seen = set()
    cleaned: List[str] = []
    for item in raw_conflicts:
        if not isinstance(item, str):
            continue
        trimmed = item.strip()
        if not trimmed:
            continue
        key = trimmed.lower()
        if key not in seen:
            seen.add(key)
            cleaned.append(trimmed[:MAX_CONFLICT_NAME_LEN])
    return cleaned[:MAX_CONFLICTS]


def parse_gift_preferences(raw: Optional[str], include_conflicts: bool = True) -> Dict:
    categories: Dict[str, str] = {c["key"]: "" for c in GIFT_PREFERENCE_CATEGORIES}
    notes: Optional[str] = None
    conflicts: List[str] = []
    updated_at: Optional[str] = None

    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                raw_cats = data.get("categories")
                if isinstance(raw_cats, dict):
                    for key in VALID_CATEGORY_KEYS:
                        val = raw_cats.get(key)
                        if isinstance(val, str):
                            categories[key] = val.strip()
                raw_notes = data.get("notes")
                if isinstance(raw_notes, str) and raw_notes.strip():
                    notes = raw_notes.strip()
                if include_conflicts:
                    conflicts = _clean_conflicts_list(data.get("conflicts"))
                raw_updated = data.get("updated_at")
                if isinstance(raw_updated, str) and raw_updated.strip():
                    updated_at = raw_updated.strip()
        except Exception:
            pass

    filled_count = sum(1 for v in categories.values() if v)
    has_preferences = filled_count > 0 or bool(notes)
    return {
        "categories": categories,
        "notes": notes,
        "conflicts": conflicts if include_conflicts else [],
        "updated_at": updated_at,
        "filled_count": filled_count,
        "has_preferences": has_preferences,
    }


def serialize_gift_preferences(
    categories: Optional[Dict[str, str]],
    notes: Optional[str] = None,
    conflicts: Optional[List[str]] = None,
) -> str:
    clean_categories: Dict[str, str] = {}
    incoming = categories or {}
    for key in VALID_CATEGORY_KEYS:
        val = incoming.get(key, "")
        if val is None:
            val = ""
        if not isinstance(val, str):
            raise ValueError(f"Preference value for '{key}' must be text.")
        trimmed = val.strip()
        if len(trimmed) > MAX_CATEGORY_VALUE_LEN:
            raise ValueError(
                f"Preference text for '{key}' must be {MAX_CATEGORY_VALUE_LEN} characters or fewer."
            )
        if trimmed:
            clean_categories[key] = trimmed

    clean_notes: Optional[str] = None
    if notes is not None:
        if not isinstance(notes, str):
            raise ValueError("Notes must be text.")
        trimmed_notes = notes.strip()
        if len(trimmed_notes) > MAX_NOTES_LEN:
            raise ValueError(f"Notes must be {MAX_NOTES_LEN} characters or fewer.")
        if trimmed_notes:
            clean_notes = trimmed_notes

    clean_conflicts: List[str] = []
    if conflicts is not None:
        if not isinstance(conflicts, list):
            raise ValueError("Conflicts must be a list of names.")
        if len(conflicts) > MAX_CONFLICTS:
            raise ValueError(f"At most {MAX_CONFLICTS} gift conflicts are allowed.")
        seen = set()
        for item in conflicts:
            if not isinstance(item, str):
                raise ValueError("Each gift conflict must be text.")
            trimmed_item = item.strip()
            if not trimmed_item:
                continue
            if len(trimmed_item) > MAX_CONFLICT_NAME_LEN:
                raise ValueError(
                    f"Conflict name must be {MAX_CONFLICT_NAME_LEN} characters or fewer."
                )
            key = trimmed_item.lower()
            if key not in seen:
                seen.add(key)
                clean_conflicts.append(trimmed_item)

    payload = {
        "categories": clean_categories,
        "notes": clean_notes,
        "conflicts": clean_conflicts,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(payload)


def users_share_family_group(db: Session, user_a_id: int, user_b_id: int) -> bool:
    if user_a_id == user_b_id:
        return True
    group_ids = [
        row[0]
        for row in db.query(GroupMember.group_id)
        .filter(GroupMember.user_id == user_a_id)
        .all()
    ]
    if not group_ids:
        return False
    shared = (
        db.query(GroupMember)
        .filter(
            GroupMember.user_id == user_b_id,
            GroupMember.group_id.in_(group_ids),
        )
        .first()
    )
    return shared is not None
