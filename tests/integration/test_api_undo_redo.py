"""Integration tests for the full API, event history, and reversible undo/redo system."""
import pytest


def test_full_flow_record_match_undo_and_reinstate(client):
    # 1. Create players
    res = client.post("/api/players", json={"name": "Alice"})
    assert res.status_code == 201
    alice_id = res.json()["id"]

    res = client.post("/api/players", json={"name": "Bob"})
    assert res.status_code == 201
    bob_id = res.json()["id"]

    # 2. Create game
    res = client.post("/api/games", json={"name": "7 Wonders", "image_url": "https://example.com/7w.jpg"})
    assert res.status_code == 201
    game_id = res.json()["id"]

    # 3. Record match: Alice scores 55, Bob scores 48 -> Alice wins
    match_payload = {
        "game_id": game_id,
        "played_at": "2026-10-23T20:30:00",
        "scores": [
            {"player_id": alice_id, "score": 55.0, "is_winner": True},
            {"player_id": bob_id, "score": 48.0, "is_winner": False},
        ],
        "notes": "Partie de test",
    }
    res = client.post("/api/matches", json=match_payload)
    assert res.status_code == 201
    match_data = res.json()
    match_id = match_data["id"]
    match_action_id = match_data["created_by_action_id"]

    # 4. Check Leaderboard: Alice has 100%, Bob has 0%
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    lb = res.json()
    assert len(lb) == 2
    assert lb[0]["player_name"] == "Alice"
    assert lb[0]["win_ratio"] == 1.0
    assert lb[0]["matches_won"] == 1
    assert lb[1]["player_name"] == "Bob"
    assert lb[1]["win_ratio"] == 0.0

    # 5. Check History feed: 4 actions (2 players, 1 game, 1 match)
    res = client.get("/api/history")
    assert res.status_code == 200
    history = res.json()
    assert len(history) == 4
    # The newest action is the match
    latest_action = history[0]
    assert latest_action["id"] == match_action_id
    assert latest_action["is_active"] is True
    assert latest_action["can_undo"] is True
    assert latest_action["can_reinstate"] is False

    # 6. UNDO the match: POST /api/history/{match_action_id}/undo
    res = client.post(f"/api/history/{match_action_id}/undo")
    assert res.status_code == 200
    undo_data = res.json()
    assert undo_data["action_type"] == "UNDO_ACTION"
    assert undo_data["target_action_id"] == match_action_id

    # 7. Verify match is now inactive and excluded from matches list & leaderboard
    res = client.get("/api/matches")
    assert res.status_code == 200
    assert len(res.json()) == 0  # no active matches!

    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    assert len(res.json()) == 0  # no active matches in leaderboard!

    # 8. Check History: now 5 actions (original match still exists in DB, now marked inactive!)
    res = client.get("/api/history")
    history = res.json()
    assert len(history) == 5
    # Find original match action in history
    match_history_item = next(item for item in history if item["id"] == match_action_id)
    assert match_history_item["is_active"] is False
    assert match_history_item["can_undo"] is False
    assert match_history_item["can_reinstate"] is True  # Can now be reinstated!

    # 9. REINSTATE the match: POST /api/history/{match_action_id}/reinstate
    res = client.post(f"/api/history/{match_action_id}/reinstate")
    assert res.status_code == 200

    # 10. Check History: now 6 actions, and match is active again!
    res = client.get("/api/history")
    history = res.json()
    assert len(history) == 6
    match_history_item = next(item for item in history if item["id"] == match_action_id)
    assert match_history_item["is_active"] is True
    assert match_history_item["can_undo"] is True
    assert match_history_item["can_reinstate"] is False

    # 11. Check Leaderboard: Alice is back to 100%!
    res = client.get("/api/leaderboard")
    lb = res.json()
    assert len(lb) == 2
    assert lb[0]["player_name"] == "Alice"
    assert lb[0]["win_ratio"] == 1.0


def test_cannot_create_duplicate_player(client):
    res = client.post("/api/players", json={"name": "Alice"})
    assert res.status_code == 201

    res = client.post("/api/players", json={"name": "Alice"})
    assert res.status_code == 400
    assert "existe déjà" in res.json()["detail"]


def test_game_leaderboard_endpoint(client):
    # Setup players
    p1 = client.post("/api/players", json={"name": "P1"}).json()["id"]
    p2 = client.post("/api/players", json={"name": "P2"}).json()["id"]

    # Setup two games
    g1 = client.post("/api/games", json={"name": "Game A"}).json()["id"]
    g2 = client.post("/api/games", json={"name": "Game B"}).json()["id"]

    # Match in Game A: P1 wins
    client.post("/api/matches", json={
        "game_id": g1,
        "scores": [
            {"player_id": p1, "score": 20.0, "is_winner": True},
            {"player_id": p2, "score": 10.0, "is_winner": False},
        ]
    })

    # Match in Game B: P2 wins
    client.post("/api/matches", json={
        "game_id": g2,
        "scores": [
            {"player_id": p1, "score": 15.0, "is_winner": False},
            {"player_id": p2, "score": 25.0, "is_winner": True},
        ]
    })

    # Query game A leaderboard
    res = client.get(f"/api/leaderboard/game/{g1}")
    assert res.status_code == 200
    lb_a = res.json()
    assert len(lb_a) == 2
    assert lb_a[0]["player_id"] == p1
    assert lb_a[0]["win_ratio"] == 1.0

    # Query game B leaderboard
    res = client.get(f"/api/leaderboard/game/{g2}")
    assert res.status_code == 200
    lb_b = res.json()
    assert len(lb_b) == 2
    assert lb_b[0]["player_id"] == p2
    assert lb_b[0]["win_ratio"] == 1.0


def test_undo_player_creation_removes_from_leaderboard_and_can_reinstate(client):
    """When a player creation is undone, they disappear from the leaderboard, and reappear upon reinstatement."""
    # Create Player 1 and Player 2
    res_p1 = client.post("/api/players", json={"name": "PlayerOne"}).json()
    p1_id = res_p1["id"]
    p1_action_id = res_p1["created_by_action_id"]

    res_p2 = client.post("/api/players", json={"name": "PlayerTwo"}).json()
    p2_id = res_p2["id"]

    # Create Game
    g_id = client.post("/api/games", json={"name": "Duel"}).json()["id"]

    # Record match: PlayerOne wins, PlayerTwo loses
    client.post("/api/matches", json={
        "game_id": g_id,
        "scores": [
            {"player_id": p1_id, "score": 10.0, "is_winner": True},
            {"player_id": p2_id, "score": 5.0, "is_winner": False},
        ]
    })

    # Leaderboard has both PlayerOne and PlayerTwo
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    lb = res.json()
    assert len(lb) == 2
    names = [e["player_name"] for e in lb]
    assert "PlayerOne" in names
    assert "PlayerTwo" in names

    # Undo PlayerOne creation
    undo_res = client.post(f"/api/history/{p1_action_id}/undo")
    assert undo_res.status_code == 200

    # Leaderboard now only has PlayerTwo! PlayerOne is completely excluded
    res_after_undo = client.get("/api/leaderboard")
    assert res_after_undo.status_code == 200
    lb_after = res_after_undo.json()
    assert len(lb_after) == 1
    assert lb_after[0]["player_name"] == "PlayerTwo"

    # Reinstate PlayerOne creation
    reinstate_res = client.post(f"/api/history/{p1_action_id}/reinstate")
    assert reinstate_res.status_code == 200

    # Leaderboard has PlayerOne back!
    res_after_reinstate = client.get("/api/leaderboard")
    assert res_after_reinstate.status_code == 200
    lb_reinstated = res_after_reinstate.json()
    assert len(lb_reinstated) == 2
    reinstated_names = [e["player_name"] for e in lb_reinstated]
    assert "PlayerOne" in reinstated_names
    assert "PlayerTwo" in reinstated_names


def test_games_sorted_by_matches_played(client):
    """Games endpoint returns matches_played and orders games by most played."""
    p1 = client.post("/api/players", json={"name": "Alice"}).json()["id"]
    p2 = client.post("/api/players", json={"name": "Bob"}).json()["id"]

    g_rare = client.post("/api/games", json={"name": "Rare Game"}).json()["id"]
    g_popular = client.post("/api/games", json={"name": "Popular Game"}).json()["id"]

    # Record 2 matches for Popular Game
    for _ in range(2):
        client.post("/api/matches", json={
            "game_id": g_popular,
            "scores": [
                {"player_id": p1, "score": 10.0, "is_winner": True},
                {"player_id": p2, "score": 5.0, "is_winner": False},
            ]
        })

    # Record 1 match for Rare Game
    client.post("/api/matches", json={
        "game_id": g_rare,
        "scores": [
            {"player_id": p1, "score": 8.0, "is_winner": True},
            {"player_id": p2, "score": 3.0, "is_winner": False},
        ]
    })

    # Query /api/games
    res = client.get("/api/games")
    assert res.status_code == 200
    games = res.json()
    assert len(games) >= 2
    assert games[0]["id"] == g_popular
    assert games[0]["matches_played"] == 2
    assert games[1]["id"] == g_rare
    assert games[1]["matches_played"] == 1
