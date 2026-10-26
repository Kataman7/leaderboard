"""FastAPI Dependency Injection helpers."""
from fastapi import Depends
import sqlite3
from typing import Generator

from app.repositories.database import get_connection
from app.repositories.action_repo import ActionRepository
from app.repositories.player_repo import PlayerRepository
from app.repositories.game_repo import GameRepository
from app.repositories.match_repo import MatchRepository
from app.services.history_service import HistoryService
from app.services.player_service import PlayerService
from app.services.game_service import GameService
from app.services.match_service import MatchService
from app.services.leaderboard_service import LeaderboardService


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_action_repo(conn: sqlite3.Connection = Depends(get_db)) -> ActionRepository:
    return ActionRepository(conn)


def get_player_repo(conn: sqlite3.Connection = Depends(get_db)) -> PlayerRepository:
    return PlayerRepository(conn)


def get_game_repo(conn: sqlite3.Connection = Depends(get_db)) -> GameRepository:
    return GameRepository(conn)


def get_match_repo(conn: sqlite3.Connection = Depends(get_db)) -> MatchRepository:
    return MatchRepository(conn)


def get_history_service(
    action_repo: ActionRepository = Depends(get_action_repo),
    player_repo: PlayerRepository = Depends(get_player_repo),
    game_repo: GameRepository = Depends(get_game_repo),
    match_repo: MatchRepository = Depends(get_match_repo),
) -> HistoryService:
    return HistoryService(action_repo, player_repo, game_repo, match_repo)


def get_player_service(
    player_repo: PlayerRepository = Depends(get_player_repo),
    history_service: HistoryService = Depends(get_history_service),
) -> PlayerService:
    return PlayerService(player_repo, history_service)


def get_game_service(
    game_repo: GameRepository = Depends(get_game_repo),
    history_service: HistoryService = Depends(get_history_service),
) -> GameService:
    return GameService(game_repo, history_service)


def get_match_service(
    match_repo: MatchRepository = Depends(get_match_repo),
    game_repo: GameRepository = Depends(get_game_repo),
    player_repo: PlayerRepository = Depends(get_player_repo),
    history_service: HistoryService = Depends(get_history_service),
) -> MatchService:
    return MatchService(match_repo, game_repo, player_repo, history_service)


def get_leaderboard_service(
    match_repo: MatchRepository = Depends(get_match_repo),
    player_repo: PlayerRepository = Depends(get_player_repo),
) -> LeaderboardService:
    return LeaderboardService(match_repo, player_repo)
