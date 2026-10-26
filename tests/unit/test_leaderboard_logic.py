"""Unit tests for leaderboard calculations."""
from app.domain.models import Match, MatchScore
from app.domain.history import calculate_leaderboard


def make_match(
    match_id: str,
    game_id: str,
    scores_list: list,
    is_active: bool = True
) -> Match:
    scores = [
        MatchScore(
            player_id=s[0],
            player_name=s[1],
            score=s[2],
            is_winner=s[3],
        )
        for s in scores_list
    ]
    return Match(
        id=match_id,
        game_id=game_id,
        game_name="Test Game",
        game_image_url="/icon.png",
        played_at="2026-10-23T20:00:00",
        created_by_action_id="act-x",
        scores=scores,
        is_active=is_active,
    )


def test_leaderboard_win_ratio_ranking():
    """Players are ranked by win ratio."""
    # Alice: 2 matches, 2 wins -> 100%
    # Bob: 3 matches, 2 wins -> 66.7%
    # Charlie: 2 matches, 0 wins -> 0%
    m1 = make_match("m1", "g1", [("p1", "Alice", 50, True), ("p2", "Bob", 40, False)])
    m2 = make_match("m2", "g1", [("p1", "Alice", 60, True), ("p3", "Charlie", 30, False)])
    m3 = make_match("m3", "g1", [("p2", "Bob", 55, True), ("p3", "Charlie", 20, False)])
    m4 = make_match("m4", "g1", [("p2", "Bob", 70, True), ("p4", "David", 35, False)])

    leaderboard = calculate_leaderboard([m1, m2, m3, m4])

    assert len(leaderboard) == 4
    # Rank 1: Alice (100%)
    assert leaderboard[0].player_name == "Alice"
    assert leaderboard[0].win_ratio == 1.0
    assert leaderboard[0].matches_played == 2
    assert leaderboard[0].matches_won == 2
    assert leaderboard[0].rank == 1

    # Rank 2: Bob (2 wins / 3 matches = 0.6667)
    assert leaderboard[1].player_name == "Bob"
    assert leaderboard[1].win_ratio == 0.6667
    assert leaderboard[1].matches_won == 2

    # Charlie (0 wins / 2 matches = 0.0)
    # David (0 wins / 1 match = 0.0)


def test_leaderboard_excludes_inactive_matches():
    """Inactive (undone) matches are excluded from ranking."""
    m1 = make_match("m1", "g1", [("p1", "Alice", 50, True), ("p2", "Bob", 40, False)], is_active=True)
    # Undone match where Bob won
    m2 = make_match("m2", "g1", [("p1", "Alice", 30, False), ("p2", "Bob", 60, True)], is_active=False)

    leaderboard = calculate_leaderboard([m1, m2])

    assert len(leaderboard) == 2
    # Alice has 1 match, 1 win, 100%
    assert leaderboard[0].player_name == "Alice"
    assert leaderboard[0].win_ratio == 1.0
    assert leaderboard[0].matches_played == 1

    # Bob has 1 match, 0 wins (the second match is inactive!)
    assert leaderboard[1].player_name == "Bob"
    assert leaderboard[1].win_ratio == 0.0
    assert leaderboard[1].matches_played == 1


def test_game_specific_leaderboard_filter():
    """Filtering by game_id only includes matches of that game."""
    m_catan = make_match("m1", "game_catan", [("p1", "Alice", 10, True), ("p2", "Bob", 8, False)])
    m_carcassonne = make_match("m2", "game_carcassonne", [("p1", "Alice", 70, False), ("p2", "Bob", 95, True)])

    catan_lb = calculate_leaderboard([m_catan, m_carcassonne], game_id="game_catan")
    assert len(catan_lb) == 2
    assert catan_lb[0].player_name == "Alice"
    assert catan_lb[0].win_ratio == 1.0
    assert catan_lb[1].player_name == "Bob"
    assert catan_lb[1].win_ratio == 0.0

    carcassonne_lb = calculate_leaderboard([m_catan, m_carcassonne], game_id="game_carcassonne")
    assert len(carcassonne_lb) == 2
    assert carcassonne_lb[0].player_name == "Bob"
    assert carcassonne_lb[0].win_ratio == 1.0


def test_leaderboard_excludes_cancelled_players():
    """Cancelled players (active_player_ids filter) are excluded from ranking."""
    m1 = make_match("m1", "g1", [("p1", "Alice", 50, True), ("p2", "Bob", 40, False)])
    m2 = make_match("m2", "g1", [("p1", "Alice", 60, True), ("p3", "Charlie", 30, False)])

    # Only Alice (p1) and Bob (p2) are active; Charlie (p3) was cancelled
    leaderboard = calculate_leaderboard([m1, m2], active_player_ids={"p1", "p2"})

    player_names = [e.player_name for e in leaderboard]
    assert "Charlie" not in player_names
    assert player_names == ["Alice", "Bob"]
    assert leaderboard[0].rank == 1
    assert leaderboard[1].rank == 2
