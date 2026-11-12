"""API endpoints for games and image uploads."""
import os
import uuid
import urllib.request
import urllib.parse
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response, RedirectResponse
from app.api.schemas import GameCreateRequest, GameResponse, GameUpdateImageRequest, GameUpdateNameRequest
from app.api.dependencies import get_game_service, get_match_repo
from app.services.game_service import GameService
from app.repositories.match_repo import MatchRepository
from app.utils.image_validator import is_valid_image_url

router = APIRouter(prefix="/api/games", tags=["Games"])

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "data/uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}


@router.get("", response_model=List[GameResponse])
def list_games(
    include_inactive: bool = Query(False),
    game_service: GameService = Depends(get_game_service),
    match_repo: MatchRepository = Depends(get_match_repo),
):
    games = game_service.list_games(include_inactive=include_inactive)
    match_counts = match_repo.get_game_match_counts()
    result = [
        GameResponse(
            id=g.id,
            name=g.name,
            image_url=g.image_url,
            original_image_url=g.original_image_url,
            created_by_action_id=g.created_by_action_id,
            is_active=g.is_active,
            created_at=g.created_at,
            matches_played=match_counts.get(g.id, 0),
        )
        for g in games
    ]
    result.sort(key=lambda x: (-x.matches_played, x.name.lower()))
    return result


@router.post("", response_model=GameResponse, status_code=201)
def create_game(
    req: GameCreateRequest,
    game_service: GameService = Depends(get_game_service),
):
    if req.image_url:
        if not is_valid_image_url(req.image_url):
            raise HTTPException(status_code=400, detail="Lien d'image invalide ou format non supporté.")
    try:
        game = game_service.create_game(
            name=req.name,
            image_url=req.image_url,
            original_image_url=req.original_image_url,
        )
        return GameResponse(
            id=game.id,
            name=game.name,
            image_url=game.image_url,
            original_image_url=game.original_image_url,
            created_by_action_id=game.created_by_action_id,
            is_active=game.is_active,
            created_at=game.created_at,
            matches_played=0,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{game_id}/name", response_model=GameResponse)
def update_game_name(
    game_id: str,
    req: GameUpdateNameRequest,
    game_service: GameService = Depends(get_game_service),
    match_repo: MatchRepository = Depends(get_match_repo),
):
    try:
        game = game_service.update_game_name(game_id, req.name)
        match_counts = match_repo.get_game_match_counts()
        return GameResponse(
            id=game.id,
            name=game.name,
            image_url=game.image_url,
            original_image_url=game.original_image_url,
            created_by_action_id=game.created_by_action_id,
            is_active=game.is_active,
            created_at=game.created_at,
            matches_played=match_counts.get(game.id, 0),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{game_id}/image", response_model=GameResponse)
@router.put("/{game_id}/image", response_model=GameResponse)
def update_game_image(
    game_id: str,
    req: GameUpdateImageRequest,
    game_service: GameService = Depends(get_game_service),
    match_repo: MatchRepository = Depends(get_match_repo),
):
    if not is_valid_image_url(req.image_url):
        raise HTTPException(status_code=400, detail="Lien d'image invalide ou format non supporté.")
    try:
        game = game_service.update_game_image(
            game_id,
            req.image_url,
            original_image_url=req.original_image_url,
            update_original=True if req.original_image_url is not None else False,
        )
        match_counts = match_repo.get_game_match_counts()
        return GameResponse(
            id=game.id,
            name=game.name,
            image_url=game.image_url,
            original_image_url=game.original_image_url,
            created_by_action_id=game.created_by_action_id,
            is_active=game.is_active,
            created_at=game.created_at,
            matches_played=match_counts.get(game.id, 0),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload-image")
async def upload_game_image(
    file: UploadFile = File(...),
    original_file: Optional[UploadFile] = File(None),
):
    """Uploads an image file for a game (and optionally its original uncropped version) and returns public URLs."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format de fichier non supporté ({ext}). Formats acceptés : {', '.join(ALLOWED_EXTENSIONS)}",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="L'image ne doit pas dépasser 10 Mo.")

    with open(dest_path, "wb") as f:
        f.write(content)

    orig_url = None
    if original_file is not None and original_file.filename:
        orig_ext = os.path.splitext(original_file.filename or "")[1].lower()
        if orig_ext in ALLOWED_EXTENSIONS:
            orig_filename = f"orig_{uuid.uuid4()}{orig_ext}"
            orig_dest = os.path.join(UPLOAD_DIR, orig_filename)
            orig_content = await original_file.read()
            if len(orig_content) <= 20 * 1024 * 1024:  # up to 20MB for raw photo
                with open(orig_dest, "wb") as f_orig:
                    f_orig.write(orig_content)
                orig_url = f"/uploads/{orig_filename}"

    return {"url": f"/uploads/{filename}", "original_url": orig_url, "filename": filename}


@router.get("/search-cover")
def search_game_cover(name: str = Query(..., min_length=1)):
    """
    Searches online for a board game box cover given its name.
    Returns the first best match and a list of alternative candidate URLs.
    """
    clean_name = name.strip()
    if not clean_name:
        return {"found": False, "image_url": None, "candidates": []}

    query = f"{clean_name} jeu de societe boite"
    search_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}&FORM=HDRSC2"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    }

    try:
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        murls = re.findall(r'murl&quot;:&quot;(https?://[^&]+?)&quot;', html)
        candidates = []
        for u in murls:
            u_clean = u.split("?")[0].lower()
            if any(u_clean.endswith(ext) for ext in [".svg", ".gif"]):
                continue
            if any(bad in u.lower() for bad in ["coloriage", "coloring", "clipart", "vector"]):
                continue
            candidates.append(u)

        if candidates:
            return {
                "found": True,
                "image_url": candidates[0],
                "candidates": candidates[:6],
            }
    except Exception:
        pass

    return {"found": False, "image_url": None, "candidates": []}


@router.get("/proxy-image")
def proxy_image(url: str = Query(...)):
    """Proxies an image to allow canvas cropping without CORS issues."""
    if not is_valid_image_url(url):
        raise HTTPException(status_code=400, detail="URL d'image invalide")
    if url.startswith("/uploads/") or url.startswith("/static/"):
        return RedirectResponse(url=url)
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
        )
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            data = resp.read()
            return Response(content=data, media_type=content_type, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossible de récupérer l'image : {e}")


@router.get("/{game_id}", response_model=GameResponse)
def get_game(
    game_id: str,
    game_service: GameService = Depends(get_game_service),
):
    game = game_service.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Jeu introuvable")
    return GameResponse(
        id=game.id,
        name=game.name,
        image_url=game.image_url,
        original_image_url=game.original_image_url,
        created_by_action_id=game.created_by_action_id,
        is_active=game.is_active,
        created_at=game.created_at,
    )
