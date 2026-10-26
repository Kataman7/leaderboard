"""SQLite Database connection and initialization."""
import os
import sqlite3
from typing import Optional

DEFAULT_DB_PATH = os.environ.get("DATABASE_PATH", "data/boardgames.db")


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    # Ensure directory exists if not in-memory
    if path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    if path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize SQLite tables and indexes."""
    conn = get_connection(db_path)
    try:
        with conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS actions (
                    id TEXT PRIMARY KEY,
                    action_type TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT,
                    target_action_id TEXT,
                    summary TEXT NOT NULL,
                    details TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (target_action_id) REFERENCES actions (id)
                );

                CREATE INDEX IF NOT EXISTS idx_actions_target ON actions (target_action_id);
                CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions (created_at);

                CREATE TABLE IF NOT EXISTS players (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
                    created_by_action_id TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (created_by_action_id) REFERENCES actions (id)
                );

                CREATE TABLE IF NOT EXISTS games (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
                    image_url TEXT NOT NULL,
                    created_by_action_id TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (created_by_action_id) REFERENCES actions (id)
                );

                CREATE TABLE IF NOT EXISTS matches (
                    id TEXT PRIMARY KEY,
                    game_id TEXT NOT NULL,
                    played_at TEXT NOT NULL,
                    notes TEXT,
                    created_by_action_id TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (game_id) REFERENCES games (id),
                    FOREIGN KEY (created_by_action_id) REFERENCES actions (id)
                );

                CREATE INDEX IF NOT EXISTS idx_matches_game ON matches (game_id);
                CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches (played_at);

                CREATE TABLE IF NOT EXISTS match_scores (
                    id TEXT PRIMARY KEY,
                    match_id TEXT NOT NULL,
                    player_id TEXT NOT NULL,
                    score REAL NOT NULL,
                    is_winner INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
                    FOREIGN KEY (player_id) REFERENCES players (id)
                );

                CREATE INDEX IF NOT EXISTS idx_match_scores_match ON match_scores (match_id);
                CREATE INDEX IF NOT EXISTS idx_match_scores_player ON match_scores (player_id);
                """
            )
    finally:
        conn.close()
