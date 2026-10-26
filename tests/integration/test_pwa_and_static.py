"""Integration tests for PWA manifest, service worker, and static asset serving."""
import io


def test_manifest_endpoint(client):
    res = client.get("/manifest.json")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "BoardScores - Suivi de jeux de société"
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
    assert "BoardScores" in res.text
    assert "manifest.json" in res.text


def test_game_image_upload(client):
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    file_data = io.BytesIO(fake_png)
    res = client.post(
        "/api/games/upload-image",
        files={"file": ("test.png", file_data, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "url" in data
    assert data["url"].startswith("/uploads/")
