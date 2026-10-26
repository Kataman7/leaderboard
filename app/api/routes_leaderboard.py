"""API endpoints for leaderboards."""
from typing import List
from fastapi import APIRouter, Depends
from app.api.schemas import LeaderboardEntryResponse
from app.api.dependencies import get_leaderboard_service
from app.services.leaderboard_service import LeaderboardService

router = APIRouter(prefix="/api/leaderboard", tags=["Leaderboard"])


@router.get("", response_model=List[LeaderboardEntryResponse])
def get_global_leaderboard(
    leaderboard_service: LeaderboardService = Depends(get_leaderboard_service),
):
    entries = leaderboard_service.get_global_leaderboard()
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
        )
        for e in entries
    ]


@router.get("/game/{game_id}", response_model=List[LeaderboardEntryResponse])
def get_game_leaderboard(
    game_id: str,
    leaderboard_service: LeaderboardService = Depends(get_leaderboard_service),
):
    entries = leaderboard_service.get_game_leaderboard(game_id)
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
        )
        for e in entries
    ]
