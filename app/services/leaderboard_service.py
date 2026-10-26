"""Leaderboard service computing global and per-game rankings."""
from typing import List, Optional, Set
from app.domain.models import PlayerLeaderboardEntry
from app.domain.history import calculate_leaderboard
from app.repositories.match_repo import MatchRepository
from app.repositories.player_repo import PlayerRepository


class LeaderboardService:
    def __init__(self, match_repo: MatchRepository, player_repo: Optional[PlayerRepository] = None):
        self.match_repo = match_repo
        self.player_repo = player_repo

    def _get_active_player_ids(self) -> Optional[Set[str]]:
        if self.player_repo:
            return {p.id for p in self.player_repo.list_players(include_inactive=False)}
        return None

    def get_global_leaderboard(self) -> List[PlayerLeaderboardEntry]:
        """Calculates global leaderboard across all active matches for active players."""
        matches = self.match_repo.list_matches(include_inactive=False, limit=10000)
        return calculate_leaderboard(matches, active_player_ids=self._get_active_player_ids())

    def get_game_leaderboard(self, game_id: str) -> List[PlayerLeaderboardEntry]:
        """Calculates leaderboard for a specific game across all active matches for active players."""
        matches = self.match_repo.list_matches(game_id=game_id, include_inactive=False, limit=10000)
        return calculate_leaderboard(matches, game_id=game_id, active_player_ids=self._get_active_player_ids())
