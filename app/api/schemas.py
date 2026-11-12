"""Pydantic schemas for API requests and responses."""
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


# --- Players ---
class PlayerCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    image_url: Optional[str] = None
    original_image_url: Optional[str] = None


class PlayerUpdateNameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)


class PlayerUpdateImageRequest(BaseModel):
    image_url: Optional[str] = None
    original_image_url: Optional[str] = None


class PlayerResponse(BaseModel):
    id: str
    name: str
    image_url: Optional[str] = None
    original_image_url: Optional[str] = None
    created_by_action_id: str
    is_active: bool
    created_at: Optional[str] = None


# --- Games ---
class GameCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    image_url: Optional[str] = None
    original_image_url: Optional[str] = None


class GameUpdateNameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class GameUpdateImageRequest(BaseModel):
    image_url: str = Field(..., min_length=1)
    original_image_url: Optional[str] = None


class GameResponse(BaseModel):
    id: str
    name: str
    image_url: str
    original_image_url: Optional[str] = None
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
class UndoActionRequest(BaseModel):
    cancelled_by: Optional[str] = None


class ReinstateActionRequest(BaseModel):
    reinstated_by: Optional[str] = None


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
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[str] = None


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
    player_image_url: Optional[str] = None
    score: float = 0.0
    opponents_defeated: int = 0
    opponents_faced: int = 0


# --- Sessions ---
class SessionResponse(BaseModel):
    id: str
    name: str
    short_name: str
    emoji: str
    start_time: str
    end_time: str
    matches_count: int
    game_names: List[str]
    player_ids: List[str]
    match_ids: List[str]


# --- Seasons ---
class SeasonMVP(BaseModel):
    player_id: str
    player_name: str
    player_image_url: Optional[str] = None
    matches_won: int


class SeasonTopGame(BaseModel):
    id: Optional[str] = None
    name: str
    image_url: str
    matches_count: int


class SeasonStreak(BaseModel):
    player_name: str
    streak: int


class SeasonBestScore(BaseModel):
    player_id: str
    player_name: str
    game_name: str
    score: float


class SeasonRivalry(BaseModel):
    p1_name: str
    p2_name: str
    matches_together: int
    p1_wins: int
    p2_wins: int


class SeasonGameItem(BaseModel):
    id: Optional[str] = None
    name: str
    image_url: str
    matches_count: int


class SeasonLeaderboardEntry(BaseModel):
    rank: int
    player_id: str
    player_name: str
    player_image_url: Optional[str] = None
    matches_played: int
    matches_won: int
    win_ratio: float
    win_percentage: int
    score: float
    opponents_defeated: int
    opponents_faced: int


class SeasonResponse(BaseModel):
    id: str
    name: str
    short_name: str
    is_current: bool
    start_time: str
    end_time: str
    date_range_str: str
    matches_count: int
    players_count: int
    games_count: int
    mvp: Optional[SeasonMVP] = None
    top_game: Optional[SeasonTopGame] = None
    win_streak: Optional[SeasonStreak] = None
    best_score: Optional[SeasonBestScore] = None
    rivalry: Optional[SeasonRivalry] = None
    leaderboard: List[SeasonLeaderboardEntry] = []
    games: List[SeasonGameItem] = []
