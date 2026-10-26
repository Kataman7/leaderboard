"""Domain models for the board game score tracker."""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any


class ActionType(str, Enum):
    CREATE_PLAYER = "CREATE_PLAYER"
    CREATE_GAME = "CREATE_GAME"
    RECORD_MATCH = "RECORD_MATCH"
    UNDO_ACTION = "UNDO_ACTION"


class EntityType(str, Enum):
    PLAYER = "player"
    GAME = "game"
    MATCH = "match"
    ACTION = "action"


@dataclass
class Action:
    id: str
    action_type: ActionType
    entity_type: EntityType
    entity_id: Optional[str]
    target_action_id: Optional[str]
    summary: str
    details: Dict[str, Any]
    created_at: str
    is_active: bool = True  # Computed dynamically via history resolution


@dataclass
class Player:
    id: str
    name: str
    created_by_action_id: str
    is_active: bool = True
    created_at: Optional[str] = None


@dataclass
class Game:
    id: str
    name: str
    image_url: str
    created_by_action_id: str
    is_active: bool = True
    created_at: Optional[str] = None


@dataclass
class MatchScore:
    player_id: str
    player_name: str
    score: float
    is_winner: bool


@dataclass
class Match:
    id: str
    game_id: str
    game_name: str
    game_image_url: str
    played_at: str
    created_by_action_id: str
    scores: List[MatchScore] = field(default_factory=list)
    is_active: bool = True
    notes: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class PlayerLeaderboardEntry:
    player_id: str
    player_name: str
    matches_played: int
    matches_won: int
    win_ratio: float  # e.g. 0.75 for 75%
    rank: int = 1
    total_score: float = 0.0
    highest_score: Optional[float] = None
    average_score: float = 0.0
