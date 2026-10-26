"""Action repository for SQLite."""
import json
import sqlite3
from typing import List, Optional
from app.domain.models import Action, ActionType, EntityType


class ActionRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def save_action(self, action: Action) -> None:
        query = """
        INSERT INTO actions (
            id, action_type, entity_type, entity_id, target_action_id,
            summary, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self.conn:
            self.conn.execute(
                query,
                (
                    action.id,
                    action.action_type.value,
                    action.entity_type.value,
                    action.entity_id,
                    action.target_action_id,
                    action.summary,
                    json.dumps(action.details),
                    action.created_at,
                ),
            )

    def get_action(self, action_id: str) -> Optional[Action]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM actions WHERE id = ?", (action_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_action(row)

    def get_all_actions(self) -> List[Action]:
        """Returns all actions ordered chronologically from oldest to newest."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM actions ORDER BY created_at ASC, rowid ASC")
        return [self._row_to_action(row) for row in cursor.fetchall()]

    def list_recent_actions(self, limit: int = 100, offset: int = 0) -> List[Action]:
        """Returns actions ordered from newest to oldest for presentation."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM actions ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        return [self._row_to_action(row) for row in cursor.fetchall()]

    def count(self) -> int:
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM actions")
        return cursor.fetchone()[0]

    def _row_to_action(self, row: sqlite3.Row) -> Action:
        return Action(
            id=row["id"],
            action_type=ActionType(row["action_type"]),
            entity_type=EntityType(row["entity_type"]),
            entity_id=row["entity_id"],
            target_action_id=row["target_action_id"],
            summary=row["summary"],
            details=json.loads(row["details"]),
            created_at=row["created_at"],
        )
