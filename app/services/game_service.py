"""Game service managing board games and creation actions."""
from datetime import datetime, timezone
import uuid
from typing import List, Optional
from app.domain.models import Game, ActionType, EntityType
from app.repositories.game_repo import GameRepository
from app.services.history_service import HistoryService

DEFAULT_GAME_IMAGE = "/static/icons/default-game.svg"


class GameService:
    def __init__(self, game_repo: GameRepository, history_service: HistoryService):
        self.game_repo = game_repo
        self.history_service = history_service

    def create_game(self, name: str, image_url: Optional[str] = None) -> Game:
        name = name.strip()
        if not name:
            raise ValueError("Le nom du jeu ne peut pas être vide.")

        existing = self.game_repo.get_game_by_name(name)
        if existing:
            if not existing.is_active:
                self.game_repo.set_game_active_status(existing.id, True)
                existing.is_active = True
                return existing
            raise ValueError(f"Le jeu '{name}' existe déjà.")

        game_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        final_image_url = (image_url or "").strip() or DEFAULT_GAME_IMAGE

        action = self.history_service.record_action(
            action_type=ActionType.CREATE_GAME,
            entity_type=EntityType.GAME,
            entity_id=game_id,
            summary=f"Nouveau jeu ajouté : {name}",
            details={"name": name, "image_url": final_image_url, "game_id": game_id},
        )

        game = Game(
            id=game_id,
            name=name,
            image_url=final_image_url,
            created_by_action_id=action.id,
            is_active=True,
            created_at=created_at,
        )
        self.game_repo.save_game(game)
        return game

    def get_or_create_game(self, name: str, image_url: Optional[str] = None) -> Game:
        existing = self.game_repo.get_game_by_name(name)
        if existing:
            if not existing.is_active:
                self.game_repo.set_game_active_status(existing.id, True)
                existing.is_active = True
            return existing
        return self.create_game(name, image_url)

    def get_game(self, game_id: str) -> Optional[Game]:
        return self.game_repo.get_game(game_id)

    def list_games(self, include_inactive: bool = False) -> List[Game]:
        return self.game_repo.list_games(include_inactive=include_inactive)
