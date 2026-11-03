"""Integration tests for new features: image editing, URL validation, player renaming/photos, leaderboard filters, and sessions."""
from fastapi.testclient import TestClient


def test_game_image_url_validation(client: TestClient):
    # Invalid URL should be rejected
    res = client.post("/api/games", json={"name": "Bad Image Game", "image_url": "ftp://not-an-http-url"})
    assert res.status_code == 400
    assert "invalide" in res.json()["detail"].lower()

    # Empty hostname or malformed url
    res2 = client.post("/api/games", json={"name": "Bad Image Game 2", "image_url": "httpx://bad"})
    assert res2.status_code == 400

    # Valid URL accepted
    res_ok = client.post("/api/games", json={"name": "Good Game", "image_url": "https://example.com/catan.jpg"})
    assert res_ok.status_code == 201
    game_id = res_ok.json()["id"]

    # Update game image with invalid URL -> 400
    res_up_bad = client.patch(f"/api/games/{game_id}/image", json={"image_url": "javascript:alert(1)"})
    assert res_up_bad.status_code == 400

    # Update game image with valid URL -> 200
    res_up_ok = client.patch(f"/api/games/{game_id}/image", json={"image_url": "https://example.com/catan-new.png"})
    assert res_up_ok.status_code == 200
    assert res_up_ok.json()["image_url"] == "https://example.com/catan-new.png"

    # Rename game
    res_rename = client.patch(f"/api/games/{game_id}/name", json={"name": "Good Game Deluxe"})
    assert res_rename.status_code == 200
    assert res_rename.json()["name"] == "Good Game Deluxe"

    # Check history has UPDATE_GAME
    hist = client.get("/api/history").json()
    assert any(h["action_type"] == "UPDATE_GAME" and "Good Game Deluxe" in h["summary"] for h in hist)


def test_player_create_rename_and_photo(client: TestClient):
    # Create player with photo
    res = client.post("/api/players", json={"name": "Julien", "image_url": "https://example.com/julien.jpg"})
    assert res.status_code == 201
    player = res.json()
    player_id = player["id"]
    assert player["name"] == "Julien"
    assert player["image_url"] == "https://example.com/julien.jpg"

    # Rename player
    res_ren = client.patch(f"/api/players/{player_id}/name", json={"name": "Julien V"})
    assert res_ren.status_code == 200
    assert res_ren.json()["name"] == "Julien V"

    # Rename with conflict -> 400
    client.post("/api/players", json={"name": "Sophie"})
    res_conflict = client.patch(f"/api/players/{player_id}/name", json={"name": "sophie"})
    assert res_conflict.status_code == 400

    # Update player photo
    res_photo = client.patch(f"/api/players/{player_id}/image", json={"image_url": "https://example.com/new-avatar.png"})
    assert res_photo.status_code == 200
    assert res_photo.json()["image_url"] == "https://example.com/new-avatar.png"


def test_leaderboard_filters_and_recent_players(client: TestClient):
    # Create players
    p1 = client.post("/api/players", json={"name": "Alice"}).json()
    p2 = client.post("/api/players", json={"name": "Bob"}).json()
    p3 = client.post("/api/players", json={"name": "Charlie"}).json()

    # Create games
    g1 = client.post("/api/games", json={"name": "Tarot"}).json()
    g2 = client.post("/api/games", json={"name": "Poker"}).json()

    # Match 1: Alice & Bob play Tarot (Alice wins)
    client.post("/api/matches", json={
        "game_id": g1["id"],
        "played_at": "2026-11-01T14:00:00Z",
        "scores": [
            {"player_id": p1["id"], "score": 10, "is_winner": True},
            {"player_id": p2["id"], "score": 5, "is_winner": False},
        ]
    })

    # Match 2: Bob & Charlie play Poker (Bob wins)
    client.post("/api/matches", json={
        "game_id": g2["id"],
        "played_at": "2026-11-01T15:00:00Z",
        "scores": [
            {"player_id": p2["id"], "score": 20, "is_winner": True},
            {"player_id": p3["id"], "score": 0, "is_winner": False},
        ]
    })

    # Recent players endpoint should return Bob and Charlie from Match 2
    rec = client.get("/api/matches/recent-players").json()
    assert set(rec["player_ids"]) == {p2["id"], p3["id"]}

    # Sessions endpoint should group both matches (separated by 1 hour)
    sess_res = client.get("/api/matches/sessions")
    assert sess_res.status_code == 200
    sessions = sess_res.json()
    assert len(sessions) == 1
    session_id = sessions[0]["id"]

    # Global leaderboard has Alice, Bob, Charlie
    lb_all = client.get("/api/leaderboard").json()
    assert len(lb_all) == 3
    assert "score" in lb_all[0]
    assert lb_all[0]["score"] >= 0.0

    # Filter leaderboard: games with Charlie -> only Bob and Charlie
    lb_charlie = client.get(f"/api/leaderboard?player_id={p3['id']}").json()
    p_names = [e["player_name"] for e in lb_charlie]
    assert "Charlie" in p_names
    assert "Bob" in p_names
    assert "Alice" not in p_names

    # Filter by session
    lb_sess = client.get(f"/api/leaderboard?session_id={session_id}").json()
    assert len(lb_sess) == 3


def test_search_game_cover_endpoint(client: TestClient):
    # Empty query should return found False
    res_empty = client.get("/api/games/search-cover?name=%20%20")
    assert res_empty.status_code == 200
    assert res_empty.json()["found"] is False

    # Real query search
    res = client.get("/api/games/search-cover?name=Catan")
    assert res.status_code == 200
    data = res.json()
    assert "found" in data
    assert "image_url" in data
    assert "candidates" in data
    if data["found"]:
        assert data["image_url"].startswith("http")


def test_match_list_batch_scores_and_indexes(client: TestClient):
    # Verify matches list returns matches with correctly joined scores
    matches_res = client.get("/api/matches")
    assert matches_res.status_code == 200
    matches = matches_res.json()
    assert isinstance(matches, list)
    for m in matches:
        assert "scores" in m
        assert isinstance(m["scores"], list)


