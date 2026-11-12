"""API endpoints for seasons."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from app.api.schemas import SeasonResponse
from app.api.dependencies import get_match_service, get_player_service, get_game_service
from app.services.match_service import MatchService
from app.services.player_service import PlayerService
from app.services.game_service import GameService
from app.services.season_service import SeasonService

router = APIRouter(prefix="/api/seasons", tags=["Seasons"])


@router.get("", response_model=List[SeasonResponse])
def list_seasons(
    match_service: MatchService = Depends(get_match_service),
    player_service: PlayerService = Depends(get_player_service),
    game_service: GameService = Depends(get_game_service),
):
    matches = match_service.list_matches(include_inactive=False, limit=10000)
    players = player_service.list_players(include_inactive=True)
    games = game_service.list_games()
    return SeasonService.list_seasons(matches, players, games)


@router.get("/current", response_model=SeasonResponse)
def get_current_season(
    match_service: MatchService = Depends(get_match_service),
    player_service: PlayerService = Depends(get_player_service),
    game_service: GameService = Depends(get_game_service),
):
    curr_id = SeasonService.get_current_season_id()
    matches = match_service.list_matches(include_inactive=False, limit=10000)
    players = player_service.list_players(include_inactive=True)
    games = game_service.list_games()
    seasons = SeasonService.list_seasons(matches, players, games)
    season = next((s for s in seasons if s["id"] == curr_id), None)
    if not season:
        raise HTTPException(status_code=404, detail="Saison actuelle introuvable")
    return season


@router.get("/{season_id}", response_model=SeasonResponse)
def get_season(
    season_id: str,
    match_service: MatchService = Depends(get_match_service),
    player_service: PlayerService = Depends(get_player_service),
    game_service: GameService = Depends(get_game_service),
):
    matches = match_service.list_matches(include_inactive=False, limit=10000)
    players = player_service.list_players(include_inactive=True)
    games = game_service.list_games()
    seasons = SeasonService.list_seasons(matches, players, games)
    season = next((s for s in seasons if s["id"].lower() == season_id.lower()), None)
    if not season:
        raise HTTPException(status_code=404, detail="Saison introuvable")
    return season
