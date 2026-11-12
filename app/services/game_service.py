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

    def create_game(
        self,
        name: str,
        image_url: Optional[str] = None,
        original_image_url: Optional[str] = None,
    ) -> Game:
        name = name.strip()
        if not name:
            raise ValueError("Le nom du jeu ne peut pas être vide.")

        existing = self.game_repo.get_game_by_name(name)
        if existing:
            if not existing.is_active:
                self.game_repo.set_game_active_status(existing.id, True)
                if image_url:
                    self.game_repo.update_game_image(
                        existing.id,
                        image_url,
                        original_image_url=original_image_url,
                        update_original=True,
                    )
                    existing.image_url = image_url
                    existing.original_image_url = original_image_url
                existing.is_active = True
                return existing
            raise ValueError(f"Le jeu '{name}' existe déjà.")

        game_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        final_image_url = (image_url or "").strip() or DEFAULT_GAME_IMAGE
        final_orig_url = (original_image_url or "").strip() or None

        action = self.history_service.record_action(
            action_type=ActionType.CREATE_GAME,
            entity_type=EntityType.GAME,
            entity_id=game_id,
            summary=f"Nouveau jeu ajouté : {name}",
            details={
                "name": name,
                "image_url": final_image_url,
                "original_image_url": final_orig_url,
                "game_id": game_id,
            },
        )

        game = Game(
            id=game_id,
            name=name,
            image_url=final_image_url,
            original_image_url=final_orig_url,
            created_by_action_id=action.id,
            is_active=True,
            created_at=created_at,
        )
        self.game_repo.save_game(game)
        return game

    def get_or_create_game(
        self,
        name: str,
        image_url: Optional[str] = None,
        original_image_url: Optional[str] = None,
    ) -> Game:
        existing = self.game_repo.get_game_by_name(name)
        if existing:
            if not existing.is_active:
                self.game_repo.set_game_active_status(existing.id, True)
                existing.is_active = True
            return existing
        return self.create_game(name, image_url, original_image_url=original_image_url)

    def get_game(self, game_id: str) -> Optional[Game]:
        return self.game_repo.get_game(game_id)

    def list_games(self, include_inactive: bool = False) -> List[Game]:
        return self.game_repo.list_games(include_inactive=include_inactive)

    def update_game_name(self, game_id: str, new_name: str) -> Game:
        game = self.game_repo.get_game(game_id)
        if not game:
            raise ValueError("Jeu introuvable.")
        new_name = new_name.strip()
        if not new_name:
            raise ValueError("Le nom du jeu ne peut pas être vide.")

        existing = self.game_repo.get_game_by_name(new_name)
        if existing and existing.id != game_id:
            raise ValueError(f"Le jeu '{new_name}' existe déjà.")

        old_name = game.name
        self.game_repo.update_game_name(game_id, new_name)
        game.name = new_name

        self.history_service.record_action(
            action_type=ActionType.UPDATE_GAME,
            entity_type=EntityType.GAME,
            entity_id=game_id,
            summary=f"Jeu renommé : {old_name} -> {new_name}",
            details={"game_id": game_id, "old_name": old_name, "new_name": new_name},
        )
        return game

    def update_game_image(
        self,
        game_id: str,
        image_url: str,
        original_image_url: Optional[str] = None,
        update_original: bool = True,
    ) -> Game:
        game = self.game_repo.get_game(game_id)
        if not game:
            raise ValueError("Jeu introuvable.")
        image_url = (image_url or "").strip()
        if not image_url:
            raise ValueError("L'URL de l'image ne peut pas être vide.")
        original_image_url = (original_image_url or "").strip() or None

        self.game_repo.update_game_image(
            game_id,
            image_url,
            original_image_url=original_image_url,
            update_original=update_original,
        )
        game.image_url = image_url
        if image_url == DEFAULT_GAME_IMAGE:
            game.original_image_url = None
        elif update_original:
            game.original_image_url = original_image_url

        self.history_service.record_action(
            action_type=ActionType.UPDATE_GAME,
            entity_type=EntityType.GAME,
            entity_id=game_id,
            summary=f"Image modifiée pour le jeu '{game.name}'",
            details={
                "game_id": game_id,
                "image_url": image_url,
                "original_image_url": game.original_image_url,
            },
        )
        return game
