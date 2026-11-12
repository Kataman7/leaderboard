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

    def create_player(
        self,
        name: str,
        image_url: Optional[str] = None,
        original_image_url: Optional[str] = None,
    ) -> Player:
        name = name.strip()
        if not name:
            raise ValueError("Le pseudo du joueur ne peut pas être vide.")

        existing = self.player_repo.get_player_by_name(name)
        if existing:
            if not existing.is_active:
                # Re-activate if was deactivated
                self.player_repo.set_player_active_status(existing.id, True)
                if image_url is not None:
                    self.player_repo.update_player_image(
                        existing.id,
                        image_url,
                        original_image_url=original_image_url,
                        update_original=True,
                    )
                    existing.image_url = image_url
                    existing.original_image_url = original_image_url
                existing.is_active = True
                return existing
            raise ValueError(f"Le joueur '{name}' existe déjà.")

        player_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        final_image_url = (image_url or "").strip() or None
        final_orig_url = (original_image_url or "").strip() or None

        # Record action in history
        action = self.history_service.record_action(
            action_type=ActionType.CREATE_PLAYER,
            entity_type=EntityType.PLAYER,
            entity_id=player_id,
            summary=f"Nouveau joueur créé : {name}",
            details={
                "name": name,
                "player_id": player_id,
                "image_url": final_image_url,
                "original_image_url": final_orig_url,
            },
        )

        player = Player(
            id=player_id,
            name=name,
            image_url=final_image_url,
            original_image_url=final_orig_url,
            created_by_action_id=action.id,
            is_active=True,
            created_at=created_at,
        )
        self.player_repo.save_player(player)
        return player

    def get_or_create_player(
        self,
        name: str,
        image_url: Optional[str] = None,
        original_image_url: Optional[str] = None,
    ) -> Player:
        existing = self.player_repo.get_player_by_name(name)
        if existing:
            if not existing.is_active:
                self.player_repo.set_player_active_status(existing.id, True)
                existing.is_active = True
            return existing
        return self.create_player(name, image_url, original_image_url=original_image_url)

    def update_player_name(self, player_id: str, new_name: str) -> Player:
        player = self.player_repo.get_player(player_id)
        if not player:
            raise ValueError("Joueur introuvable.")
        new_name = new_name.strip()
        if not new_name:
            raise ValueError("Le pseudo ne peut pas être vide.")

        existing = self.player_repo.get_player_by_name(new_name)
        if existing and existing.id != player_id:
            raise ValueError(f"Le pseudo '{new_name}' est déjà utilisé par un autre joueur.")

        old_name = player.name
        self.player_repo.update_player_name(player_id, new_name)
        player.name = new_name

        self.history_service.record_action(
            action_type=ActionType.UPDATE_PLAYER,
            entity_type=EntityType.PLAYER,
            entity_id=player_id,
            summary=f"Joueur renommé : {old_name} -> {new_name}",
            details={"player_id": player_id, "old_name": old_name, "new_name": new_name},
        )
        return player

    def update_player_image(
        self,
        player_id: str,
        image_url: Optional[str],
        original_image_url: Optional[str] = None,
        update_original: bool = True,
    ) -> Player:
        player = self.player_repo.get_player(player_id)
        if not player:
            raise ValueError("Joueur introuvable.")
        image_url = (image_url or "").strip() or None
        original_image_url = (original_image_url or "").strip() or None

        self.player_repo.update_player_image(
            player_id,
            image_url,
            original_image_url=original_image_url,
            update_original=update_original,
        )
        player.image_url = image_url
        if update_original or image_url is None:
            player.original_image_url = original_image_url if image_url is not None else None

        self.history_service.record_action(
            action_type=ActionType.UPDATE_PLAYER,
            entity_type=EntityType.PLAYER,
            entity_id=player_id,
            summary=f"Photo modifiée pour le joueur '{player.name}'",
            details={
                "player_id": player_id,
                "image_url": image_url,
                "original_image_url": player.original_image_url,
            },
        )
        return player

    def get_player(self, player_id: str) -> Optional[Player]:
        return self.player_repo.get_player(player_id)

    def list_players(self, include_inactive: bool = False) -> List[Player]:
        return self.player_repo.list_players(include_inactive=include_inactive)
