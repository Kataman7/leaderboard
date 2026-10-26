"""API endpoints for games and image uploads."""
import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from app.api.schemas import GameCreateRequest, GameResponse
from app.api.dependencies import get_game_service, get_match_repo
from app.services.game_service import GameService
from app.repositories.match_repo import MatchRepository

router = APIRouter(prefix="/api/games", tags=["Games"])

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "data/uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}


@router.get("", response_model=List[GameResponse])
def list_games(
    include_inactive: bool = Query(False),
    game_service: GameService = Depends(get_game_service),
    match_repo: MatchRepository = Depends(get_match_repo),
):
    games = game_service.list_games(include_inactive=include_inactive)
    match_counts = match_repo.get_game_match_counts()
    result = [
        GameResponse(
            id=g.id,
            name=g.name,
            image_url=g.image_url,
            created_by_action_id=g.created_by_action_id,
            is_active=g.is_active,
            created_at=g.created_at,
            matches_played=match_counts.get(g.id, 0),
        )
        for g in games
    ]
    result.sort(key=lambda x: (-x.matches_played, x.name.lower()))
    return result


@router.post("", response_model=GameResponse, status_code=201)
def create_game(
    req: GameCreateRequest,
    game_service: GameService = Depends(get_game_service),
):
    try:
        game = game_service.create_game(name=req.name, image_url=req.image_url)
        return GameResponse(
            id=game.id,
            name=game.name,
            image_url=game.image_url,
            created_by_action_id=game.created_by_action_id,
            is_active=game.is_active,
            created_at=game.created_at,
            matches_played=0,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload-image")
async def upload_game_image(file: UploadFile = File(...)):
    """Uploads an image file for a game and returns its public URL."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format de fichier non supporté ({ext}). Formats acceptés : {', '.join(ALLOWED_EXTENSIONS)}",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    # 5MB limit
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 5 Mo.")

    with open(dest_path, "wb") as f:
        f.write(content)

    return {"url": f"/uploads/{filename}", "filename": filename}


@router.get("/{game_id}", response_model=GameResponse)
def get_game(
    game_id: str,
    game_service: GameService = Depends(get_game_service),
):
    game = game_service.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Jeu introuvable")
    return GameResponse(
        id=game.id,
        name=game.name,
        image_url=game.image_url,
        created_by_action_id=game.created_by_action_id,
        is_active=game.is_active,
        created_at=game.created_at,
    )
