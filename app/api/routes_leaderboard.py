"""API endpoints for leaderboards."""
from typing import List, Optional, Set
from fastapi import APIRouter, Depends, Query
from app.api.schemas import LeaderboardEntryResponse
from app.api.dependencies import get_leaderboard_service, get_match_service
from app.services.leaderboard_service import LeaderboardService
from app.services.match_service import MatchService
from app.services.session_service import SessionService

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])


@router.get("", response_model=List[LeaderboardEntryResponse])
def get_leaderboard(
    game_id: Optional[str] = Query(None),
    player_id: Optional[str] = Query(None, description="Filtre: parties avec ce joueur"),
    session_id: Optional[str] = Query(None, description="Filtre: parties de cette session"),
    leaderboard_service: LeaderboardService = Depends(get_leaderboard_service),
    match_service: MatchService = Depends(get_match_service),
):
    match_ids_filter: Optional[Set[str]] = None
    if session_id:
        matches = match_service.list_matches(include_inactive=False, limit=10000)
        sessions = SessionService.detect_sessions(matches)
        target_session = next((s for s in sessions if s["id"] == session_id), None)
        if target_session:
            match_ids_filter = set(target_session["match_ids"])
        else:
            # Session not found or has no matches -> empty set
            match_ids_filter = set()

    entries = leaderboard_service.get_leaderboard(
        game_id=game_id,
        with_player_id=player_id,
        match_ids=match_ids_filter,
    )
    return [
        LeaderboardEntryResponse(
            player_id=e.player_id,
            player_name=e.player_name,
            matches_played=e.matches_played,
            matches_won=e.matches_won,
            win_ratio=e.win_ratio,
            rank=e.rank,
            total_score=e.total_score,
            highest_score=e.highest_score,
            average_score=e.average_score,
            player_image_url=e.player_image_url,
        )
        for e in entries
    ]


@router.get("/game/{game_id}", response_model=List[LeaderboardEntryResponse])
def get_game_leaderboard(
    game_id: str,
    player_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    leaderboard_service: LeaderboardService = Depends(get_leaderboard_service),
    match_service: MatchService = Depends(get_match_service),
):
    return get_leaderboard(
        game_id=game_id,
        player_id=player_id,
        session_id=session_id,
        leaderboard_service=leaderboard_service,
        match_service=match_service,
    )
