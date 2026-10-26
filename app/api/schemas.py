"""Pydantic schemas for API requests and responses."""
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


# --- Players ---
class PlayerCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class PlayerResponse(BaseModel):
    id: str
    name: str
    created_by_action_id: str
    is_active: bool
    created_at: Optional[str] = None


# --- Games ---
class GameCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    image_url: Optional[str] = None


class GameResponse(BaseModel):
    id: str
    name: str
    image_url: str
    created_by_action_id: str
    is_active: bool
    created_at: Optional[str] = None
    matches_played: int = 0


# --- Matches ---
class MatchScoreInput(BaseModel):
    player_id: str
    score: Optional[float] = 0.0
    is_winner: Optional[bool] = False


class MatchCreateRequest(BaseModel):
    game_id: str
    played_at: Optional[str] = None
    scores: List[MatchScoreInput]
    notes: Optional[str] = None


class MatchScoreResponse(BaseModel):
    player_id: str
    player_name: str
    score: float
    is_winner: bool


class MatchResponse(BaseModel):
    id: str
    game_id: str
    game_name: str
    game_image_url: str
    played_at: str
    created_by_action_id: str
    scores: List[MatchScoreResponse]
    is_active: bool
    notes: Optional[str] = None
    created_at: Optional[str] = None


# --- History & Undo ---
class HistoryItemResponse(BaseModel):
    id: str
    action_type: str
    entity_type: str
    entity_id: Optional[str] = None
    target_action_id: Optional[str] = None
    summary: str
    details: Dict[str, Any]
    created_at: str
    is_active: bool
    can_undo: bool
    can_reinstate: bool
    cancelling_undo_id: Optional[str] = None


# --- Leaderboard ---
class LeaderboardEntryResponse(BaseModel):
    player_id: str
    player_name: str
    matches_played: int
    matches_won: int
    win_ratio: float
    rank: int
    total_score: float
    highest_score: Optional[float] = None
    average_score: float
