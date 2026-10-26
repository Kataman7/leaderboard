"""History service managing actions, event-sourcing resolution, and undo/redo synchronization."""
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import uuid

from app.domain.models import Action, ActionType, EntityType
from app.domain.history import resolve_action_states, get_active_cancelling_undo
from app.repositories.action_repo import ActionRepository
from app.repositories.player_repo import PlayerRepository
from app.repositories.game_repo import GameRepository
from app.repositories.match_repo import MatchRepository


class HistoryService:
    def __init__(
        self,
        action_repo: ActionRepository,
        player_repo: PlayerRepository,
        game_repo: GameRepository,
        match_repo: MatchRepository,
    ):
        self.action_repo = action_repo
        self.player_repo = player_repo
        self.game_repo = game_repo
        self.match_repo = match_repo

    def record_action(
        self,
        action_type: ActionType,
        entity_type: EntityType,
        entity_id: Optional[str],
        summary: str,
        details: Dict[str, Any],
        target_action_id: Optional[str] = None,
    ) -> Action:
        action_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        action = Action(
            id=action_id,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            target_action_id=target_action_id,
            summary=summary,
            details=details,
            created_at=created_at,
            is_active=True,
        )
        self.action_repo.save_action(action)
        self.sync_entity_projections()
        return action

    def undo_action(self, target_action_id: str) -> Action:
        """
        Creates a new UNDO_ACTION in the history targeting `target_action_id`.
        If target_action is active, this cancels it.
        If target_action is an UNDO_ACTION itself, cancelling it reinstates the original action!
        """
        target_action = self.action_repo.get_action(target_action_id)
        if not target_action:
            raise ValueError(f"Action '{target_action_id}' non trouvée.")

        # Determine summary description
        if target_action.action_type == ActionType.UNDO_ACTION:
            summary = f"Rétablissement de : {target_action.details.get('target_summary', 'Action')}"
        else:
            summary = f"Annulation de : {target_action.summary}"

        details = {
            "target_action_id": target_action.id,
            "target_action_type": target_action.action_type.value,
            "target_entity_type": target_action.entity_type.value,
            "target_entity_id": target_action.entity_id,
            "target_summary": target_action.summary,
        }

        undo_action = self.record_action(
            action_type=ActionType.UNDO_ACTION,
            entity_type=EntityType.ACTION,
            entity_id=target_action.id,
            summary=summary,
            details=details,
            target_action_id=target_action.id,
        )
        return undo_action

    def reinstate_action(self, action_id: str) -> Action:
        """
        Reinstates a cancelled action.
        Finds the active UNDO_ACTION that is currently cancelling this action,
        and creates an undo targeting that undo action.
        """
        all_actions = self.action_repo.get_all_actions()
        cancelling_undo = get_active_cancelling_undo(action_id, all_actions)
        if not cancelling_undo:
            raise ValueError(f"L'action '{action_id}' n'est pas actuellement annulée.")

        return self.undo_action(cancelling_undo.id)

    def sync_entity_projections(self) -> None:
        """
        Evaluates the current state of all actions and synchronizes the
        `is_active` flag of players, games, and matches in SQLite projections.
        """
        all_actions = self.action_repo.get_all_actions()
        states = resolve_action_states(all_actions)

        # Sync players, games, and matches based on the active state of their creating action
        for action in all_actions:
            if action.action_type == ActionType.CREATE_PLAYER and action.entity_id:
                is_active = states.get(action.id, True)
                self.player_repo.set_player_active_status(action.entity_id, is_active)

            elif action.action_type == ActionType.CREATE_GAME and action.entity_id:
                is_active = states.get(action.id, True)
                self.game_repo.set_game_active_status(action.entity_id, is_active)

            elif action.action_type == ActionType.RECORD_MATCH and action.entity_id:
                is_active = states.get(action.id, True)
                self.match_repo.set_match_active_status(action.entity_id, is_active)

    def get_history(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """
        Returns recent history with computed status and action capabilities.
        """
        all_actions = self.action_repo.get_all_actions()
        states = resolve_action_states(all_actions)
        actions_by_id = {a.id: a for a in all_actions}

        recent = self.action_repo.list_recent_actions(limit=limit, offset=offset)
        result = []
        for a in recent:
            is_active = states.get(a.id, True)
            cancelling_undo = get_active_cancelling_undo(a.id, all_actions) if not is_active else None

            result.append(
                {
                    "id": a.id,
                    "action_type": a.action_type.value,
                    "entity_type": a.entity_type.value,
                    "entity_id": a.entity_id,
                    "target_action_id": a.target_action_id,
                    "summary": a.summary,
                    "details": a.details,
                    "created_at": a.created_at,
                    "is_active": is_active,
                    "can_undo": is_active,
                    "can_reinstate": not is_active,
                    "cancelling_undo_id": cancelling_undo.id if cancelling_undo else None,
                }
            )
        return result
