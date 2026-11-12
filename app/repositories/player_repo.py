"""Player repository for SQLite."""
import sqlite3
from typing import List, Optional
from app.domain.models import Player


class PlayerRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def save_player(self, player: Player) -> None:
        query = """
        INSERT INTO players (id, name, image_url, original_image_url, created_by_action_id, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            image_url=excluded.image_url,
            original_image_url=excluded.original_image_url,
            is_active=excluded.is_active
        """
        with self.conn:
            self.conn.execute(
                query,
                (
                    player.id,
                    player.name,
                    player.image_url,
                    player.original_image_url,
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

    def update_player_name(self, player_id: str, new_name: str) -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE players SET name = ? WHERE id = ?",
                (new_name.strip(), player_id),
            )

    def update_player_image(
        self,
        player_id: str,
        image_url: Optional[str],
        original_image_url: Optional[str] = None,
        update_original: bool = False,
    ) -> None:
        with self.conn:
            cleaned_img = image_url.strip() if image_url else None
            cleaned_orig = original_image_url.strip() if original_image_url else None
            if update_original or cleaned_img is None:
                self.conn.execute(
                    "UPDATE players SET image_url = ?, original_image_url = ? WHERE id = ?",
                    (cleaned_img, cleaned_orig if cleaned_img is not None else None, player_id),
                )
            else:
                self.conn.execute(
                    "UPDATE players SET image_url = ? WHERE id = ?",
                    (cleaned_img, player_id),
                )

    def _row_to_player(self, row: sqlite3.Row) -> Player:
        image_url = None
        if "image_url" in row.keys():
            image_url = row["image_url"]
        original_image_url = None
        if "original_image_url" in row.keys():
            original_image_url = row["original_image_url"]
        return Player(
            id=row["id"],
            name=row["name"],
            image_url=image_url,
            original_image_url=original_image_url,
            created_by_action_id=row["created_by_action_id"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
        )
