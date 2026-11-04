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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Present - Modern Wishlists & Gift Sharing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
