"""Validation utilities for images and URLs."""
import urllib.parse
import urllib.request
import re


def is_valid_image_url(url: str, check_reachability: bool = False) -> bool:
    """
    Checks if an image URL is well-formed and valid.
    Supports internal relative paths (/uploads/..., /static/...)
    and external http(s) URLs.
    """
    if not url or not isinstance(url, str):
        return False

    url = url.strip()
    if not url:
        return False

    # Internal safe paths
    if url.startswith("/uploads/") or url.startswith("/static/"):
        return True

    # External URLs
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False

    # Basic hostname validation
    if "." not in parsed.netloc and parsed.netloc != "localhost":
        return False

    if check_reachability:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Leaderboard/1.0)"},
                method="HEAD"
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                content_type = resp.headers.get("Content-Type", "").lower()
                return resp.status < 400 and ("image" in content_type or len(content_type) == 0)
        except Exception:
            # Try GET with range 0-1024 if HEAD method is blocked by target server
            try:
                req_get = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Leaderboard/1.0)", "Range": "bytes=0-1024"},
                )
                with urllib.request.urlopen(req_get, timeout=3.0) as resp:
                    return resp.status < 400
            except Exception:
                return False

    return True
