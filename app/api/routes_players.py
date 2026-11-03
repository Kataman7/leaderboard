"""API endpoints for players."""
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from app.api.schemas import (
    PlayerCreateRequest,
    PlayerResponse,
    PlayerUpdateNameRequest,
    PlayerUpdateImageRequest,
)
from app.api.dependencies import get_player_service
from app.services.player_service import PlayerService
from app.utils.image_validator import is_valid_image_url

router = APIRouter(prefix="/api/players", tags=["Players"])

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "data/uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}


@router.get("", response_model=List[PlayerResponse])
def list_players(
    include_inactive: bool = Query(False),
    player_service: PlayerService = Depends(get_player_service),
):
    players = player_service.list_players(include_inactive=include_inactive)
    return [
        PlayerResponse(
            id=p.id,
            name=p.name,
            image_url=p.image_url,
            created_by_action_id=p.created_by_action_id,
            is_active=p.is_active,
            created_at=p.created_at,
        )
        for p in players
    ]


@router.post("", response_model=PlayerResponse, status_code=201)
def create_player(
    req: PlayerCreateRequest,
    player_service: PlayerService = Depends(get_player_service),
):
    if req.image_url and not is_valid_image_url(req.image_url):
        raise HTTPException(status_code=400, detail="Lien d'image invalide ou format non supporté.")
    try:
        player = player_service.create_player(name=req.name, image_url=req.image_url)
        return PlayerResponse(
            id=player.id,
            name=player.name,
            image_url=player.image_url,
            created_by_action_id=player.created_by_action_id,
            is_active=player.is_active,
            created_at=player.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload-image")
async def upload_player_image(file: UploadFile = File(...)):
    """Uploads an avatar/photo file for a player and returns its public URL."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format de fichier non supporté ({ext}). Formats acceptés : {', '.join(ALLOWED_EXTENSIONS)}",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"player_{uuid.uuid4()}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 5 Mo.")

    with open(dest_path, "wb") as f:
        f.write(content)

    return {"url": f"/uploads/{filename}", "filename": filename}


@router.patch("/{player_id}/name", response_model=PlayerResponse)
def update_player_name(
    player_id: str,
    req: PlayerUpdateNameRequest,
    player_service: PlayerService = Depends(get_player_service),
):
    try:
        player = player_service.update_player_name(player_id, req.name)
        return PlayerResponse(
            id=player.id,
            name=player.name,
            image_url=player.image_url,
            created_by_action_id=player.created_by_action_id,
            is_active=player.is_active,
            created_at=player.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{player_id}/image", response_model=PlayerResponse)
def update_player_image(
    player_id: str,
    req: PlayerUpdateImageRequest,
    player_service: PlayerService = Depends(get_player_service),
):
    if req.image_url and not is_valid_image_url(req.image_url):
        raise HTTPException(status_code=400, detail="Lien d'image invalide ou format non supporté.")
    try:
        player = player_service.update_player_image(player_id, req.image_url)
        return PlayerResponse(
            id=player.id,
            name=player.name,
            image_url=player.image_url,
            created_by_action_id=player.created_by_action_id,
            is_active=player.is_active,
            created_at=player.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{player_id}", response_model=PlayerResponse)
def get_player(
    player_id: str,
    player_service: PlayerService = Depends(get_player_service),
):
    player = player_service.get_player(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Joueur introuvable")
    return PlayerResponse(
        id=player.id,
        name=player.name,
        image_url=player.image_url,
        created_by_action_id=player.created_by_action_id,
        is_active=player.is_active,
        created_at=player.created_at,
    )
