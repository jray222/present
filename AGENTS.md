# Present: Architecture & Guide for Coding Agents

Present is a self-hosted family wishlist registry and gift-sharing application built with the warmth and design language of **Staple** and **Glance**. It is designed to replace Gifster with a clean, ad-free experience, high security, and zero-friction options for grandparents and non-tech family members.

## Tech Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, SQLite (at `backend/data/present.db`), WebAuthn, Google OAuth, PyOTP, BeautifulSoup4 (Scraper).
- **Frontend**: React 19, Vite 8, Tailwind CSS 3, Lucide React icons, Nunito & Nunito Sans fonts.
- **Design Tokens**: Warm cream (`#fff8ee`), rounded 3xl cards, soft drop-shadows, pine green and holiday cranberry accents.

## Key Features & Invariants
1. **Secret Gifting / Anti-Spoiler Engine**:
   - When a wishlist owner queries their own list, all `claims` and reservation statuses are strictly stripped out in `app/routers/wishlists.py`. The recipient never sees what has been claimed or purchased.
   - When other family members or guests view the list, claims are included with the buyer's name.
2. **Duplicate Prevention & Lockout**:
   - As soon as an item is marked "Reserved" or "Purchased", other buyers receive a 409 Conflict if they try to claim it.
   - On the frontend, already-taken items are greyed out (`opacity-65`), and external product links are completely disabled to prevent anyone from accidentally opening the store page and ordering the same gift twice.
3. **Link Return Prompt ("Did you buy this?")**:
   - When someone clicks a store link and returns to the app tab, a prompt automatically asks if they bought it, making it effortless to mark items off.
4. **Grandparent Mode (Magic Links)**:
   - Dedicated public sharing route: `/shared/:token` (`SharedGuestPage.jsx`).
   - Grandparents can view lists with large text and tap "I bought this" just by typing their nickname once. No password or login required.
5. **Managed Profiles (Kids / Dependents)**:
   - Parents can switch between their own lists and their children's lists via top tabs (`ListsPage.jsx`).
   - Children don't need emails or passwords; parents manage items, and relatives can reserve gifts for them in secret.
6. **Secret Santa Generator**:
   - Random derangement drawer with exclusion constraints (e.g. spouses don't draw each other).
   - Generates private envelope reveal links (`/santa/view/:token` or `/santa/reveal/:token`) and stores results permanently in SQLite.
7. **Share as Text & Image**:
   - One-tap "Copy as Text" formatted for SMS/iMessage.
   - Client-side HTML5 canvas generator (`src/lib/imageExport.js`) that produces a high-res PNG gift card for relatives who refuse to click links.

## Commands
```bash
# Run both backend and frontend locally:
./run.sh

# Backend tests:
cd backend && .venv/bin/pytest tests/ -v

# Frontend lint & build:
cd frontend && npm run lint && npm run build
```

## Security Audits (`cloudflare/security-audit-skill`)
- **Upstream GitHub Reference**: https://github.com/cloudflare/security-audit-skill (`skills/security-audit/SKILL.md`, installed globally at `~/.gemini/config/skills/security-audit/SKILL.md`).
- **Sync Latest Upstream Skill Before Auditing**:
  ```bash
  git -C ~/.gemini/config/skills/.security-audit-repo pull --ff-only origin main && cp -r ~/.gemini/config/skills/.security-audit-repo/skills/security-audit/* ~/.gemini/config/skills/security-audit/
  ```
- **Post-Update Recommendation Rule**: After completing any major feature update or modifying authentication (WebAuthn, OAuth, TOTP, magic links), household/wishlist scoping, anti-spoiler/claim locking, URL scraping, or image exports, proactively recommend running a `security-audit` scan (using `flash` subagents and outputting to `~/security-audit-skill/present/run-<N>/`).
