"""API endpoints for players."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.schemas import PlayerCreateRequest, PlayerResponse
from app.api.dependencies import get_player_service
from app.services.player_service import PlayerService

router = APIRouter(prefix="/api/players", tags=["Players"])


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
    try:
        player = player_service.create_player(name=req.name)
        return PlayerResponse(
            id=player.id,
            name=player.name,
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
        created_by_action_id=player.created_by_action_id,
        is_active=player.is_active,
        created_at=player.created_at,
    )
