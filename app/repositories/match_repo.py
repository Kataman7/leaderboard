"""Match repository for SQLite."""
import sqlite3
import uuid
from typing import List, Optional
from app.domain.models import Match, MatchScore


class MatchRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def save_match(self, match: Match) -> None:
        with self.conn:
            # Upsert match
            self.conn.execute(
                """
                INSERT INTO matches (id, game_id, played_at, notes, created_by_action_id, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    game_id=excluded.game_id,
                    played_at=excluded.played_at,
                    notes=excluded.notes,
                    is_active=excluded.is_active
                """,
                (
                    match.id,
                    match.game_id,
                    match.played_at,
                    match.notes,
                    match.created_by_action_id,
                    1 if match.is_active else 0,
                    match.created_at,
                ),
            )

            # Replace match scores
            self.conn.execute("DELETE FROM match_scores WHERE match_id = ?", (match.id,))
            for s in match.scores:
                score_id = str(uuid.uuid4())
                self.conn.execute(
                    """
                    INSERT INTO match_scores (id, match_id, player_id, score, is_winner)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        score_id,
                        match.id,
                        s.player_id,
                        s.score,
                        1 if s.is_winner else 0,
                    ),
                )

    def get_match(self, match_id: str) -> Optional[Match]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT m.*, g.name AS game_name, g.image_url AS game_image_url
            FROM matches m
            JOIN games g ON m.game_id = g.id
            WHERE m.id = ?
            """,
            (match_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        scores = self._get_match_scores(match_id)
        return self._row_to_match(row, scores)

    def list_matches(
        self,
        game_id: Optional[str] = None,
        include_inactive: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Match]:
        cursor = self.conn.cursor()
        params = []
        where_clauses = []

        if not include_inactive:
            where_clauses.append("m.is_active = 1")
        if game_id:
            where_clauses.append("m.game_id = ?")
            params.append(game_id)

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        query = f"""
        SELECT m.*, g.name AS game_name, g.image_url AS game_image_url
        FROM matches m
        JOIN games g ON m.game_id = g.id
        {where_sql}
        ORDER BY m.played_at DESC, m.created_at DESC
        LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        result = []
        for row in rows:
            scores = self._get_match_scores(row["id"])
            result.append(self._row_to_match(row, scores))
        return result

    def set_match_active_status(self, match_id: str, is_active: bool) -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE matches SET is_active = ? WHERE id = ?",
                (1 if is_active else 0, match_id),
            )

    def get_game_match_counts(self) -> dict:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT game_id, COUNT(*) as cnt
            FROM matches
            WHERE is_active = 1
            GROUP BY game_id
            """
        )
        return {row["game_id"]: row["cnt"] for row in cursor.fetchall()}

    def _get_match_scores(self, match_id: str) -> List[MatchScore]:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            SELECT ms.player_id, p.name AS player_name, ms.score, ms.is_winner
            FROM match_scores ms
            JOIN players p ON ms.player_id = p.id
            WHERE ms.match_id = ?
            ORDER BY ms.score DESC, ms.is_winner DESC
            """,
            (match_id,),
        )
        return [
            MatchScore(
                player_id=r["player_id"],
                player_name=r["player_name"],
                score=r["score"],
                is_winner=bool(r["is_winner"]),
            )
            for r in cursor.fetchall()
        ]

    def _row_to_match(self, row: sqlite3.Row, scores: List[MatchScore]) -> Match:
        return Match(
            id=row["id"],
            game_id=row["game_id"],
            game_name=row["game_name"],
            game_image_url=row["game_image_url"],
            played_at=row["played_at"],
            created_by_action_id=row["created_by_action_id"],
            scores=scores,
            is_active=bool(row["is_active"]),
            notes=row["notes"],
            created_at=row["created_at"],
        )
