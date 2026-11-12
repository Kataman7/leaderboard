"""Integration tests for PWA manifest, service worker, and static asset serving."""
import io


def test_manifest_endpoint(client):
    res = client.get("/manifest.json")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Leaderboard"
    assert data["display"] == "standalone"
    assert len(data["icons"]) >= 2


def test_service_worker_endpoint(client):
    res = client.get("/sw.js")
    assert res.status_code == 200
    assert "application/javascript" in res.headers["content-type"]
    assert res.headers.get("Service-Worker-Allowed") == "/"
    assert "CACHE_NAME" in res.text


def test_index_page(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "Leaderboard" in res.text
    assert "manifest.json" in res.text


def test_game_image_upload(client):
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    file_data = io.BytesIO(fake_png)
    orig_data = io.BytesIO(fake_png)
    res = client.post(
        "/api/games/upload-image",
        files={
            "file": ("cropped.png", file_data, "image/png"),
            "original_file": ("raw_original.png", orig_data, "image/png"),
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "url" in data
    assert data["url"].startswith("/uploads/")
    assert "original_url" in data
    assert data["original_url"].startswith("/uploads/orig_")

    # Create game with both URLs and verify persistence
    game_res = client.post(
        "/api/games",
        json={"name": "OrigTestGame", "image_url": data["url"], "original_image_url": data["original_url"]},
    )
    assert game_res.status_code == 201
    game_data = game_res.json()
    assert game_data["image_url"] == data["url"]
    assert game_data["original_image_url"] == data["original_url"]

    # Verify players upload & persistence too
    p_res = client.post(
        "/api/players/upload-image",
        files={
            "file": ("player_crop.png", io.BytesIO(fake_png), "image/png"),
            "original_file": ("player_raw.png", io.BytesIO(fake_png), "image/png"),
        },
    )
    assert p_res.status_code == 200
    p_upload = p_res.json()
    assert p_upload["original_url"].startswith("/uploads/orig_player_")

    player_create = client.post(
        "/api/players",
        json={"name": "OrigPlayer", "image_url": p_upload["url"], "original_image_url": p_upload["original_url"]},
    )
    assert player_create.status_code == 201
    player_data = player_create.json()
    assert player_data["image_url"] == p_upload["url"]
    assert player_data["original_image_url"] == p_upload["original_url"]
