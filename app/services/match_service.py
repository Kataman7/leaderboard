"""Match service for recording and querying board game matches."""
from datetime import datetime, timezone
import uuid
from typing import List, Optional, Dict, Any
from app.domain.models import Match, MatchScore, ActionType, EntityType
from app.repositories.match_repo import MatchRepository
from app.repositories.game_repo import GameRepository
from app.repositories.player_repo import PlayerRepository
from app.services.history_service import HistoryService


class MatchService:
    def __init__(
        self,
        match_repo: MatchRepository,
        game_repo: GameRepository,
        player_repo: PlayerRepository,
        history_service: HistoryService,
    ):
        self.match_repo = match_repo
        self.game_repo = game_repo
        self.player_repo = player_repo
        self.history_service = history_service

    def record_match(
        self,
        game_id: str,
        scores_data: List[Dict[str, Any]],
        played_at: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Match:
        """
        scores_data: list of dicts:
        [
            {"player_id": "...", "score": 42.0, "is_winner": True},
            ...
        ]
        """
        game = self.game_repo.get_game(game_id)
        if not game:
            raise ValueError(f"Jeu '{game_id}' introuvable.")

        if not scores_data or len(scores_data) < 1:
            raise ValueError("Une partie doit avoir au moins un joueur participant.")

        # Validate players and scores
        scores: List[MatchScore] = []
        winner_names: List[str] = []

        for s in scores_data:
            pid = s.get("player_id")
            player = self.player_repo.get_player(pid)
            if not player:
                raise ValueError(f"Joueur '{pid}' introuvable.")

            raw_score = float(s.get("score", 0.0))
            is_winner = bool(s.get("is_winner", False))

            if is_winner:
                winner_names.append(player.name)

            scores.append(
                MatchScore(
                    player_id=player.id,
                    player_name=player.name,
                    score=raw_score,
                    is_winner=is_winner,
                )
            )

        match_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        final_played_at = played_at or created_at

        # Summary for history
        if winner_names:
            winners_str = ", ".join(winner_names)
            summary = f"Partie de {game.name} (Victoire : {winners_str})"
        else:
            summary = f"Partie de {game.name} ({len(scores)} joueurs)"

        details = {
            "match_id": match_id,
            "game_id": game.id,
            "game_name": game.name,
            "played_at": final_played_at,
            "notes": notes,
            "participants": [
                {
                    "player_id": s.player_id,
                    "player_name": s.player_name,
                    "score": s.score,
                    "is_winner": s.is_winner,
                }
                for s in scores
            ],
        }

        # 1. Record Action in history
        action = self.history_service.record_action(
            action_type=ActionType.RECORD_MATCH,
            entity_type=EntityType.MATCH,
            entity_id=match_id,
            summary=summary,
            details=details,
        )

        # 2. Save Match projection
        match = Match(
            id=match_id,
            game_id=game.id,
            game_name=game.name,
            game_image_url=game.image_url,
            played_at=final_played_at,
            created_by_action_id=action.id,
            scores=scores,
            is_active=True,
            notes=notes,
            created_at=created_at,
        )
        self.match_repo.save_match(match)
        return match

    def get_match(self, match_id: str) -> Optional[Match]:
        return self.match_repo.get_match(match_id)

    def list_matches(
        self,
        game_id: Optional[str] = None,
        include_inactive: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Match]:
        return self.match_repo.list_matches(
            game_id=game_id,
            include_inactive=include_inactive,
            limit=limit,
            offset=offset,
        )
