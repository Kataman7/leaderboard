"""Game repository for SQLite."""
import sqlite3
from typing import List, Optional
from app.domain.models import Game


class GameRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def save_game(self, game: Game) -> None:
        query = """
        INSERT INTO games (id, name, image_url, created_by_action_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            image_url=excluded.image_url,
            is_active=excluded.is_active
        """
        with self.conn:
            self.conn.execute(
                query,
                (
                    game.id,
                    game.name,
                    game.image_url,
                    game.created_by_action_id,
                    1 if game.is_active else 0,
                    game.created_at,
                ),
            )

    def get_game(self, game_id: str) -> Optional[Game]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_game(row)

    def get_game_by_name(self, name: str) -> Optional[Game]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM games WHERE name = ? COLLATE NOCASE", (name.strip(),))
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_game(row)

    def list_games(self, include_inactive: bool = False) -> List[Game]:
        cursor = self.conn.cursor()
        if include_inactive:
            cursor.execute("SELECT * FROM games ORDER BY name COLLATE NOCASE ASC")
        else:
            cursor.execute("SELECT * FROM games WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC")
        return [self._row_to_game(row) for row in cursor.fetchall()]

    def set_game_active_status(self, game_id: str, is_active: bool) -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE games SET is_active = ? WHERE id = ?",
                (1 if is_active else 0, game_id),
            )

    def _row_to_game(self, row: sqlite3.Row) -> Game:
        return Game(
            id=row["id"],
            name=row["name"],
            image_url=row["image_url"],
            created_by_action_id=row["created_by_action_id"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
        )
