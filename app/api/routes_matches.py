"""API endpoints for matches and scores."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.schemas import (
    MatchCreateRequest,
    MatchResponse,
    MatchScoreResponse,
)
from app.api.dependencies import get_match_service
from app.services.match_service import MatchService

router = APIRouter(prefix="/api/matches", tags=["Matches"])


@router.get("", response_model=List[MatchResponse])
def list_matches(
    game_id: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    match_service: MatchService = Depends(get_match_service),
):
    matches = match_service.list_matches(
        game_id=game_id,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )
    return [
        MatchResponse(
            id=m.id,
            game_id=m.game_id,
            game_name=m.game_name,
            game_image_url=m.game_image_url,
            played_at=m.played_at,
            created_by_action_id=m.created_by_action_id,
            scores=[
                MatchScoreResponse(
                    player_id=s.player_id,
                    player_name=s.player_name,
                    score=s.score,
                    is_winner=s.is_winner,
                )
                for s in m.scores
            ],
            is_active=m.is_active,
            notes=m.notes,
            created_at=m.created_at,
        )
        for m in matches
    ]


@router.post("", response_model=MatchResponse, status_code=201)
def record_match(
    req: MatchCreateRequest,
    match_service: MatchService = Depends(get_match_service),
):
    try:
        match = match_service.record_match(
            game_id=req.game_id,
            scores_data=[s.model_dump() for s in req.scores],
            played_at=req.played_at,
            notes=req.notes,
        )
        return MatchResponse(
            id=match.id,
            game_id=match.game_id,
            game_name=match.game_name,
            game_image_url=match.game_image_url,
            played_at=match.played_at,
            created_by_action_id=match.created_by_action_id,
            scores=[
                MatchScoreResponse(
                    player_id=s.player_id,
                    player_name=s.player_name,
                    score=s.score,
                    is_winner=s.is_winner,
                )
                for s in match.scores
            ],
            is_active=match.is_active,
            notes=match.notes,
            created_at=match.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{match_id}", response_model=MatchResponse)
def get_match(
    match_id: str,
    match_service: MatchService = Depends(get_match_service),
):
    match = match_service.get_match(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Partie introuvable")
    return MatchResponse(
        id=match.id,
        game_id=match.game_id,
        game_name=match.game_name,
        game_image_url=match.game_image_url,
        played_at=match.played_at,
        created_by_action_id=match.created_by_action_id,
        scores=[
            MatchScoreResponse(
                player_id=s.player_id,
                player_name=s.player_name,
                score=s.score,
                is_winner=s.is_winner,
            )
            for s in match.scores
        ],
        is_active=match.is_active,
        notes=match.notes,
        created_at=match.created_at,
    )
