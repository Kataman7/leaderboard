"""FastAPI application entrypoint."""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.repositories.database import init_db
from app.api.routes_players import router as players_router
from app.api.routes_games import router as games_router
from app.api.routes_matches import router as matches_router
from app.api.routes_history import router as history_router
from app.api.routes_leaderboard import router as leaderboard_router


UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "data/uploads")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database
    init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="Board Game Leaderboard & Score Tracker",
    description="Application PWA pour suivre les scores de jeux de société avec historique append-only et annulation réversible.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(players_router)
app.include_router(games_router)
app.include_router(matches_router)
app.include_router(history_router)
app.include_router(leaderboard_router)

# Mount uploads static directory
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Mount frontend static directory
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# PWA special routes
@app.get("/manifest.json")
def get_manifest():
    manifest_path = os.path.join(STATIC_DIR, "manifest.json")
    return FileResponse(manifest_path, media_type="application/manifest+json")


@app.get("/sw.js")
def get_service_worker():
    sw_path = os.path.join(STATIC_DIR, "sw.js")
    response = FileResponse(sw_path, media_type="application/javascript")
    response.headers["Service-Worker-Allowed"] = "/"
    return response


# Root and SPA fallback
@app.get("/")
def get_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(index_path, media_type="text/html")


@app.get("/health")
def health_check():
    return {"status": "ok"}
