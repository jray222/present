# Present 🎁

A self-hosted family gift registry and wishlist application with anti-spoiler protection, grandparent magic link access, multi-item sharing, and an automated Secret Santa generator.

---

## Quick start (Docker)

```bash
docker compose up -d
```

Open [http://localhost:5732](http://localhost:5732) and create your account. Data persists in the `present-data` Docker volume.
A cryptographic secret key is generated and stored in the volume on first start.

To build the image locally from source instead of pulling from GitHub:
```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

---

## Updates from GitHub

Every merge to `main` runs tests and linter, and if they pass, builds and publishes `ghcr.io/jray222/present:latest` (plus a `sha-<commit>` tag) for `linux/amd64` and `linux/arm64` via [`.github/workflows/docker-image.yml`](.github/workflows/docker-image.yml).

A daily check ([`.github/workflows/base-image-update.yml`](.github/workflows/base-image-update.yml), 09:00 UTC) checks whether the base `python:3.12-slim` image has been updated upstream and rebuilds the image automatically.

---

## Local Development

```bash
# 1. Backend setup
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 2. Frontend setup
cd ../frontend
npm ci

# 3. Run both dev servers
cd ..
./run.sh
```

- **Frontend dev server**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Swagger Docs**: [http://localhost:5732/docs](http://localhost:5732/docs)
- **Run backend tests**: `pytest backend/tests -q`
- **Run frontend linter**: `cd frontend && npm run lint`

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | Generated once, stored in data dir | Cryptographic key for JWT sessions and Fernet encryption |
| `DATABASE_URL` | `sqlite:////app/backend/data/present.db` | SQLite database path |
| `PUBLIC_URL` | `http://localhost:5732` | Public address used in magic links and Secret Santa envelopes |
| `ALLOW_REGISTRATION` | `true` | Allows user sign-up |
| `TRUST_PROXY_HEADERS` | `true` | Trust `X-Forwarded-*` headers when behind reverse proxy or Cloudflare |
| `GOOGLE_CLIENT_ID` | Unset | Optional Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Unset | Optional Google OAuth 2.0 client secret |
| `TZ` | `America/New_York` | Container time zone |

---

## Key Features

- **Anti-Spoiler Protection**: Recipient list owners never see reservation status or buyer names on their own lists.
- **Duplicate Lockout**: Items marked as reserved or purchased are greyed out with store links locked to prevent duplicate gifts.
- **Grandparent Mode (`/shared/:token`)**: Zero-friction magic links for non-tech-savvy relatives to view gifts and mark items as bought without creating an account.
- **Native iOS & Mobile Sharing**: Dedicated iMessage/SMS integration, WhatsApp sharing, and system share sheet with multi-item selection and *"Mark as reserved?"* prompts.
- **High-Resolution Graphic Card Export**: HTML5 Canvas renderer that exports printable PNG gift cards.
- **Resilient URL Scraper**: Resolves Amazon (desktop & mobile `/dp/`, `/gp/aw/d/`), Shopify boutiques, Target, and major retailers with automatic clean URL normalization.
- **Built-in Image Proxy (`/api/images/proxy`)**: Streams external product imagery same-origin, bypassing Safari cross-origin redirect and mixed-content blocks.
- **Secret Santa Generator (`/santa`)**: Derangement matching solver with custom exclusion rules (e.g. spouses don't draw each other) and private reveal envelope links.
- **Child Profiles**: Managed dependent profiles without needing separate email accounts.
- **Multi-Factor Security**: Passkeys (WebAuthn/FIDO2), TOTP 2FA with backup recovery codes, and Group Admin rescue tools.
