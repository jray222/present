from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.config import settings

# Routers
from app.routers import (
    auth, google_auth, passkey, profiles, wishlists, claims,
    secret_santa, settings as settings_router, groups, images
)
from app.frontend import mount_frontend
from pathlib import Path
import os
import logging

logger = logging.getLogger(__name__)

def get_cors_origins() -> list[str]:
    origins = set()
    if settings.PUBLIC_URL:
        origins.add(settings.PUBLIC_URL.rstrip("/"))
    if settings.FRONTEND_ORIGIN:
        origins.add(settings.FRONTEND_ORIGIN.rstrip("/"))
    # Local development hosts
    origins.add("http://localhost:5173")
    origins.add("http://127.0.0.1:5173")
    origins.add("http://localhost:9967")
    origins.add("http://127.0.0.1:9967")
    origins.add("http://localhost:5732")
    origins.add("http://127.0.0.1:5732")
    return sorted(list(origins))

def run_migrations(target_engine=None, ini_path=None):
    """
    Run Alembic database migrations on startup.
    - If database is fresh (no tables), runs alembic upgrade head to create full schema.
    - If database already has tables but no migration record, marks it with alembic stamp baseline before upgrading.
    - Fails loudly if a migration fails, instead of swallowing errors.
    """
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import inspect, text

    curr_engine = target_engine or engine
    config_path = ini_path or (Path(__file__).resolve().parent.parent / "alembic.ini")

    alembic_cfg = Config(str(config_path))
    alembic_cfg.set_main_option("sqlalchemy.url", str(curr_engine.url))

    inspector = inspect(curr_engine)
    existing_tables = set(inspector.get_table_names())

    has_app_tables = bool(existing_tables.intersection({"users", "wishlists", "wishlist_items"}))
    has_migration_record = False

    if "alembic_version" in existing_tables:
        with curr_engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            versions = [row[0] for row in result]
            if versions:
                has_migration_record = True
                if "3742f1b31179" in versions:
                    conn.execute(
                        text("UPDATE alembic_version SET version_num = '0002_add_sort_order_and_is_archived' WHERE version_num = '3742f1b31179'")
                    )
                    conn.commit()

    if has_app_tables and not has_migration_record:
        logger.info("Found existing database with tables but no migration record; stamping baseline...")
        command.stamp(alembic_cfg, "0001_baseline")

    logger.info("Applying database migrations to head...")
    command.upgrade(alembic_cfg, "head")

@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    yield

app = FastAPI(
    title="Present - Modern Wishlists & Gift Sharing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "app": "present"}

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(google_auth.router, prefix="/api")
app.include_router(passkey.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(wishlists.router, prefix="/api")
app.include_router(claims.router, prefix="/api")
app.include_router(secret_santa.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(images.router, prefix="/api")

# Mount frontend dist
_dist = Path(os.getenv("FRONTEND_DIST", Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"))
mount_frontend(app, _dist)
