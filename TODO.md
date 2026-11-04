# Present — Roadmap & TODO

Tracking upcoming features, enhancements, and completed milestones for Present.

---

## ✅ Completed Milestones

### 1. iOS / Mobile Native Share Sheet & Messaging Options
- [x] **Direct Native iOS & Mobile Sharing**:
  - Direct **"Send via iMessage / SMS"** using `sms:&body=...` (iOS) and `sms:?body=...` (Android/Desktop). Always works on iOS Safari regardless of HTTP vs. HTTPS!
  - Direct **"Share via WhatsApp"** (`https://api.whatsapp.com/send?text=...`).
  - Direct **"System Share Sheet"** (`navigator.share`) with informational helper modal when accessed over HTTP explaining Apple's HTTPS policy.
  - Direct **"Grandparent Magic Link"** one-tap copy.
  - Direct **"Copy Formatted Text (SMS)"** and **"Download Gift Card Image"** (Canvas PNG).
- [x] **Multi-Item Selection Sharing**:
  - Multi-item selection mode on wishlists with checkboxes in both Big Cards and Compact List views.
  - Floating bottom selection toolbar: *"{N} items selected"*, *"[ Select All ]"*, *"[ Clear ]"*, *"[ 🎁 Share Selected ]"*.
  - Full support inside `ShareModal`: seamlessly toggle between "Full List" and "Selected Items" with an inline item checklist.
  - Formatted SMS text export and HTML5 Canvas card export render only the selected items when in multi-select mode.
- [x] **"Mark as reserved?" Confirmation Suggestion**:
  - When sharing specific items, prompts: *"Would you like to mark these {N} gift(s) as reserved so nobody else buys them?"*
  - One-tap batch claim (`POST /api/claims/batch`) marks them reserved and triggers the share flow atomically.

### 2. Scraping & Product Link Resolution
- [x] **Bulletproof URL Scraper Engine**:
  - Handles complex Amazon mobile (`/gp/aw/d/`) and desktop (`/HAPPRUN.../dp/B0B28G5Y4R`) links.
  - Strips tracking tags and canonicalizes to clean `https://www.amazon.com/dp/{ASIN}`.
  - Extracts 4K high-res images directly from Amazon's `data-a-dynamic-image` JSON structure.
  - Handles multi-source price extraction (apex desktop, whole + fraction, offscreen spans, input fields).
  - Resilient bot-check / CAPTCHA bypass and URL slug title fallback (e.g. `HAPPRUN Native 1080P Outdoor Projector Standard`).
  - Instant paste autofill in Add Item modal with clean URL replacement.

### 3. App Base URL & Network Configuration
- [x] Explicit **"App Base URL & Network"** configuration card in Settings.
- [x] Persists custom public URL in SQLite `system_settings` table.
- [x] Auto-derives origin dynamically from incoming request `Host` header if default localhost is used.
- [x] Clear guidance for iOS HTTPS requirements (reverse proxy / Cloudflare Tunnel).

### 4. Wishlist Management & Aesthetic
- [x] Staple design aesthetic: warm cream `#fff8ee`, 3xl rounded cards, Nunito typography, pine emerald and cranberry holiday accents.
- [x] View switcher: Big Cards (product imagery grid) vs. Compact Detail (dense rows).
- [x] Edit wishlist title, occasion, description.
- [x] Delete wishlist with confirmation modal.
- [x] Managed child / dependent profiles without email accounts.

### 5. Gifting Experience & Anti-Duplicate Protections
- [x] Two-stage claim lifecycle (`available` → `reserved` → `purchased`).
- [x] Strict Anti-Spoiler rule: recipient never sees claims/reservations made by family members.
- [x] Link lockout on claimed gifts: greyed out and store link locked to prevent accidental duplicate purchases.
- [x] Window focus return-prompt: "Welcome back! Did you buy [Gift]?" to encourage immediate marking off.
- [x] Frictionless Grandparent Mode magic link (`/shared/:token`).

### 6. Multiple Families & Invites
- [x] Multiple family groups per user (In-Laws, Immediate Family, Friends).
- [x] Group invite codes (`/groups/join`) with one-click copy.
- [x] Member directory with active status badges.
- [x] Group Admin rescue controls: reset member password, reset member 2FA for locked-out family members.

### 7. Secret Santa
- [x] Random derangement matching solver with custom exclusion rules (e.g. spouses don't draw each other).
- [x] Persistent assignment storage in SQLite.
- [x] Secret envelope reveal links (`/santa/reveal/:token`).

### 8. Authentication & Security
- [x] Password + bcrypt hashing.
- [x] Mandatory 2FA enforcement for password users.
- [x] TOTP Two-Factor Authentication with backup recovery codes.
- [x] FIDO2 / WebAuthn Passkeys (Biometric / FaceID / TouchID / YubiKey).
- [x] Google OAuth 2.0 / OpenID Connect backend support.

---

## 📌 Full Backlog / Upcoming Enhancements

- [ ] Direct invite link that auto-fills group code on sign-up (`https://.../join?code=XYZ`).
- [ ] Drag-and-drop or manual reordering of items within a wishlist.
- [ ] Archive wishlist option (hide past Christmas lists without deleting them).
- [ ] Target / Walmart / BestBuy specific DOM fallbacks.
- [ ] 7-day reservation expiration warning ("Did you purchase this yet?").
- [ ] Session revocation ("Log out other devices").
