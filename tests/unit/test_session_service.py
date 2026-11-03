"""Unit tests for automatic session clustering and titles."""
from datetime import datetime, timezone, timedelta
from app.domain.models import Match, MatchScore
from app.services.session_service import SessionService


def test_session_clustering_within_gap():
    # 3 matches separated by 1 hour -> should be 1 session
    base_time = datetime(2026, 10, 31, 20, 0, 0, tzinfo=timezone.utc)
    matches = [
        Match(
            id="m1",
            game_id="g1",
            game_name="Catan",
            game_image_url="",
            played_at=(base_time).isoformat(),
            created_by_action_id="a1",
            scores=[MatchScore(player_id="p1", player_name="Alice", score=10, is_winner=True)],
        ),
        Match(
            id="m2",
            game_id="g2",
            game_name="Skyjo",
            game_image_url="",
            played_at=(base_time + timedelta(hours=1, minutes=30)).isoformat(),
            created_by_action_id="a2",
            scores=[MatchScore(player_id="p1", player_name="Alice", score=5, is_winner=False)],
        ),
        Match(
            id="m3",
            game_id="g1",
            game_name="Catan",
            game_image_url="",
            played_at=(base_time + timedelta(hours=3, minutes=15)).isoformat(),
            created_by_action_id="a3",
            scores=[MatchScore(player_id="p1", player_name="Alice", score=10, is_winner=True)],
        ),
    ]

    sessions = SessionService.detect_sessions(matches)
    assert len(sessions) == 1
    session = sessions[0]
    assert session["matches_count"] == 3
    assert set(session["game_names"]) == {"Catan", "Skyjo"}
    assert len(session["games"]) == 2
    assert {g["name"] for g in session["games"]} == {"Catan", "Skyjo"}
    assert "Soirée" in session["name"]
    assert session["emoji"] == "🌙"
    assert session["short_name"] == "🌙 31/10"


def test_session_emojis_and_periods():
    # Morning: 09:00
    m_morning = Match(id="m_m", game_id="g1", game_name="Catan", game_image_url="", played_at="2026-11-01T09:00:00Z", created_by_action_id="a")
    sess_m = SessionService.detect_sessions([m_morning])[0]
    assert sess_m["emoji"] == "☀️"
    assert sess_m["short_name"] == "☀️ 01/11"
    assert "Matinée" in sess_m["name"]

    # Afternoon: 14:30
    m_afternoon = Match(id="m_a", game_id="g1", game_name="Catan", game_image_url="", played_at="2026-11-01T14:30:00Z", created_by_action_id="a")
    sess_a = SessionService.detect_sessions([m_afternoon])[0]
    assert sess_a["emoji"] == "🌤️"
    assert sess_a["short_name"] == "🌤️ 01/11"
    assert "Après-midi" in sess_a["name"]

    # Evening: 20:15
    m_evening = Match(id="m_e", game_id="g1", game_name="Catan", game_image_url="", played_at="2026-11-01T20:15:00Z", created_by_action_id="a")
    sess_e = SessionService.detect_sessions([m_evening])[0]
    assert sess_e["emoji"] == "🌙"
    assert sess_e["short_name"] == "🌙 01/11"
    assert "Soirée" in sess_e["name"]

    # Late night: 02:30
    m_night = Match(id="m_n", game_id="g1", game_name="Catan", game_image_url="", played_at="2026-11-01T02:30:00Z", created_by_action_id="a")
    sess_n = SessionService.detect_sessions([m_night])[0]
    assert sess_n["emoji"] == "🌕"
    assert sess_n["short_name"] == "🌕 01/11"
    assert "Nuit" in sess_n["name"]


def test_session_over_midnight():
    # Evening starts at 21:00 on Oct 31, finishes at 03:00 on Nov 1
    t1 = datetime(2026, 10, 31, 21, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 31, 23, 30, 0, tzinfo=timezone.utc)
    t3 = datetime(2026, 11, 1, 1, 15, 0, tzinfo=timezone.utc)
    t4 = datetime(2026, 11, 1, 3, 0, 0, tzinfo=timezone.utc)

    matches = [
        Match(id="m1", game_id="g1", game_name="Catan", game_image_url="", played_at=t1.isoformat(), created_by_action_id="a1"),
        Match(id="m2", game_id="g1", game_name="Catan", game_image_url="", played_at=t2.isoformat(), created_by_action_id="a2"),
        Match(id="m3", game_id="g2", game_name="Odin", game_image_url="", played_at=t3.isoformat(), created_by_action_id="a3"),
        Match(id="m4", game_id="g2", game_name="Odin", game_image_url="", played_at=t4.isoformat(), created_by_action_id="a4"),
    ]

    sessions = SessionService.detect_sessions(matches)
    assert len(sessions) == 1
    assert sessions[0]["matches_count"] == 4
    assert "Soirée" in sessions[0]["name"]


def test_session_split_on_large_gap():
    # Match in afternoon, then match next day
    t1 = datetime(2026, 10, 30, 14, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 31, 20, 0, 0, tzinfo=timezone.utc)

    matches = [
        Match(id="m1", game_id="g1", game_name="Catan", game_image_url="", played_at=t1.isoformat(), created_by_action_id="a1"),
        Match(id="m2", game_id="g1", game_name="Catan", game_image_url="", played_at=t2.isoformat(), created_by_action_id="a2"),
    ]

    sessions = SessionService.detect_sessions(matches)
    assert len(sessions) == 2
    # Reverse chronological: newest first
    assert sessions[0]["match_ids"] == ["m2"]
    assert sessions[1]["match_ids"] == ["m1"]
