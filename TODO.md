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
- [x] Secret envelope reveal links (`/santa/reveal/:token` or `/santa/view/:token`).

### 8. Authentication & Security
- [x] Password + bcrypt hashing.
- [x] Mandatory 2FA enforcement for password users.
- [x] TOTP Two-Factor Authentication with backup recovery codes.
- [x] FIDO2 / WebAuthn Passkeys (Biometric / FaceID / TouchID / YubiKey).
- [x] Google OAuth 2.0 / OpenID Connect backend support.
- [x] Session revocation ("Log out of other devices").
- [x] Self-service account password change & admin password reset.
- [x] Sliding window in-memory rate limiting on authentication and sensitive endpoints.
- [x] Anti-SSRF safe HTTP client for scraper & image proxy blocking loopback, link-local, private, and metadata IPs.
- [x] Database migrations managed via Alembic.
- [x] Database export & backup utility (`run.sh backup` and Settings download).

### 9. New Feature Deliveries
- [x] Direct invite links that auto-fill group code on sign-up and auto-join for logged-in users (`/join?code=XYZ`).
- [x] Wishlist item reordering with backend persistence and frontend rank controls (`/api/wishlists/{id}/reorder`).
- [x] Wishlist archiving to hide past holiday lists without deleting history.
- [x] Store scraping enhancements for Amazon, Target, Walmart, and Best Buy.
- [x] 7-day reservation purchase reminder badge & 1-tap "Bought it?" confirmation.

---

## 📌 Full Backlog / Upcoming Enhancements

- [ ] Email / Push notifications for upcoming Secret Santa deadlines.
- [ ] Drag-and-drop HTML5 drag handler for wishlist items in addition to up/down controls.
- [ ] Export wishlists to PDF or CSV.
