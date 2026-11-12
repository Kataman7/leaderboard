"""Unit tests for season service and quarterly aggregation."""
from datetime import datetime, timezone
from app.domain.models import Match, MatchScore, Player
from app.services.season_service import (
    SeasonService,
    get_quarter_bounds,
    get_quarter_info,
    format_date_range_no_parentheses,
)


def test_quarter_bounds_and_info():
    dt_q1 = datetime(2026, 2, 15, 14, 0, 0, tzinfo=timezone.utc)
    y, q, season_id, name, short_name = get_quarter_info(dt_q1)
    assert y == 2026
    assert q == 1
    assert season_id == "2026-T1"
    assert "Saison 1 2026 • Hiver" == name
    assert "T1 2026" == short_name
    assert "(" not in name and ")" not in name
    assert "(" not in short_name and ")" not in short_name

    start_dt, end_dt = get_quarter_bounds(2026, 1)
    date_str = format_date_range_no_parentheses(start_dt, end_dt)
    assert "1 janv. → 31 mars 2026" in date_str
    assert "(" not in date_str and ")" not in date_str


def test_season_filtering_and_list():
    p1 = Player(id="p1", name="Alice", image_url=None, created_by_action_id="a1")
    p2 = Player(id="p2", name="Bob", image_url=None, created_by_action_id="a1")

    # Q1 match (March 2026)
    m1 = Match(
        id="m1",
        game_id="g1",
        game_name="Catan",
        game_image_url="",
        played_at="2026-03-10T15:00:00Z",
        created_by_action_id="a1",
        scores=[
            MatchScore(player_id="p1", player_name="Alice", score=10, is_winner=True),
            MatchScore(player_id="p2", player_name="Bob", score=8, is_winner=False),
        ],
    )
    # Q4 match (November 2026)
    m2 = Match(
        id="m2",
        game_id="g2",
        game_name="Shadow Hunter",
        game_image_url="",
        played_at="2026-11-05T20:00:00Z",
        created_by_action_id="a2",
        scores=[
            MatchScore(player_id="p2", player_name="Bob", score=1, is_winner=True),
            MatchScore(player_id="p1", player_name="Alice", score=0, is_winner=False),
        ],
    )

    matches = [m1, m2]
    players = [p1, p2]

    # Filter by 2026-T1
    q1_matches = SeasonService.filter_matches_by_season(matches, "2026-T1")
    assert len(q1_matches) == 1
    assert q1_matches[0].id == "m1"

    # Filter by 2026-T4
    q4_matches = SeasonService.filter_matches_by_season(matches, "2026-T4")
    assert len(q4_matches) == 1
    assert q4_matches[0].id == "m2"

    seasons = SeasonService.list_seasons(matches, players)
    # Both T4 (newest) and T1 should exist
    assert any(s["id"] == "2026-T4" for s in seasons)
    assert any(s["id"] == "2026-T1" for s in seasons)

    # Check strict no parentheses constraint across all string fields
    def verify_no_parentheses(data):
        if isinstance(data, str):
            assert "(" not in data and ")" not in data, f"Found parentheses in: {data}"
        elif isinstance(data, list):
            for item in data:
                verify_no_parentheses(item)
        elif isinstance(data, dict):
            for k, v in data.items():
                verify_no_parentheses(v)

    verify_no_parentheses(seasons)
