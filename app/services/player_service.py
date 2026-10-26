"""Player service managing player profiles and creation actions."""
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from app.domain.models import Player, ActionType, EntityType
from app.repositories.player_repo import PlayerRepository
from app.services.history_service import HistoryService


class PlayerService:
    def __init__(self, player_repo: PlayerRepository, history_service: HistoryService):
        self.player_repo = player_repo
        self.history_service = history_service

    def create_player(self, name: str) -> Player:
        name = name.strip()
        if not name:
            raise ValueError("Le pseudo du joueur ne peut pas être vide.")

        existing = self.player_repo.get_player_by_name(name)
        if existing:
            if not existing.is_active:
                # Re-activate if was deactivated
                self.player_repo.set_player_active_status(existing.id, True)
                existing.is_active = True
                return existing
            raise ValueError(f"Le joueur '{name}' existe déjà.")

        player_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()

        # Record action in history
        action = self.history_service.record_action(
            action_type=ActionType.CREATE_PLAYER,
            entity_type=EntityType.PLAYER,
            entity_id=player_id,
            summary=f"Nouveau joueur créé : {name}",
            details={"name": name, "player_id": player_id},
        )

        player = Player(
            id=player_id,
            name=name,
            created_by_action_id=action.id,
            is_active=True,
            created_at=created_at,
        )
        self.player_repo.save_player(player)
        return player

    def get_or_create_player(self, name: str) -> Player:
        existing = self.player_repo.get_player_by_name(name)
        if existing:
            if not existing.is_active:
                self.player_repo.set_player_active_status(existing.id, True)
                existing.is_active = True
            return existing
        return self.create_player(name)

    def get_player(self, player_id: str) -> Optional[Player]:
        return self.player_repo.get_player(player_id)

    def list_players(self, include_inactive: bool = False) -> List[Player]:
        return self.player_repo.list_players(include_inactive=include_inactive)
