"""Player repository for SQLite."""
import sqlite3
from typing import List, Optional
from app.domain.models import Player


class PlayerRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def save_player(self, player: Player) -> None:
        query = """
        INSERT INTO players (id, name, created_by_action_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            is_active=excluded.is_active
        """
        with self.conn:
            self.conn.execute(
                query,
                (
                    player.id,
                    player.name,
                    player.created_by_action_id,
                    1 if player.is_active else 0,
                    player.created_at,
                ),
            )

    def get_player(self, player_id: str) -> Optional[Player]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM players WHERE id = ?", (player_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_player(row)

    def get_player_by_name(self, name: str) -> Optional[Player]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM players WHERE name = ? COLLATE NOCASE", (name.strip(),))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_player(row)

    def list_players(self, include_inactive: bool = False) -> List[Player]:
        cursor = self.conn.cursor()
        if include_inactive:
            cursor.execute("SELECT * FROM players ORDER BY name COLLATE NOCASE ASC")
        else:
            cursor.execute("SELECT * FROM players WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC")
        return [self._row_to_player(row) for row in cursor.fetchall()]

    def set_player_active_status(self, player_id: str, is_active: bool) -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE players SET is_active = ? WHERE id = ?",
                (1 if is_active else 0, player_id),
            )

    def _row_to_player(self, row: sqlite3.Row) -> Player:
        return Player(
            id=row["id"],
            name=row["name"],
            created_by_action_id=row["created_by_action_id"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
        )
