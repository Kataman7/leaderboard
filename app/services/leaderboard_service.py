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

    def _get_active_players_info(self):
        active_ids = None
        images = {}
        if self.player_repo:
            players = self.player_repo.list_players(include_inactive=False)
            active_ids = {p.id for p in players}
            images = {p.id: p.image_url for p in players}
        return active_ids, images

    def get_leaderboard(
        self,
        game_id: Optional[str] = None,
        with_player_id: Optional[str] = None,
        match_ids: Optional[Set[str]] = None,
    ) -> List[PlayerLeaderboardEntry]:
        """Calculates leaderboard rankings based on active matches with optional filters."""
        matches = self.match_repo.list_matches(
            game_id=game_id,
            include_inactive=False,
            limit=10000,
        )
        active_ids, images = self._get_active_players_info()
        return calculate_leaderboard(
            matches,
            game_id=game_id,
            with_player_id=with_player_id,
            match_ids=match_ids,
            active_player_ids=active_ids,
            player_images=images,
        )

    def get_global_leaderboard(
        self,
        with_player_id: Optional[str] = None,
        match_ids: Optional[Set[str]] = None,
    ) -> List[PlayerLeaderboardEntry]:
        """Calculates global leaderboard across all active matches for active players."""
        return self.get_leaderboard(with_player_id=with_player_id, match_ids=match_ids)

    def get_game_leaderboard(
        self,
        game_id: str,
        with_player_id: Optional[str] = None,
        match_ids: Optional[Set[str]] = None,
    ) -> List[PlayerLeaderboardEntry]:
        """Calculates leaderboard for a specific game across all active matches for active players."""
        return self.get_leaderboard(game_id=game_id, with_player_id=with_player_id, match_ids=match_ids)
