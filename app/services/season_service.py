"""Season management and quarterly aggregation service."""
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple, Set
from app.domain.models import Match, Player, Game
from app.domain.history import calculate_leaderboard
from app.services.session_service import parse_iso

MONTHS_FR = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]

MONTHS_SHORT_FR = [
    "", "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc."
]

SEASONS_LABELS = {
    1: "Hiver",
    2: "Printemps",
    3: "Été",
    4: "Automne",
}


def get_quarter_bounds(year: int, quarter: int) -> Tuple[datetime, datetime]:
    if quarter == 1:
        return (
            datetime(year, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            datetime(year, 3, 31, 23, 59, 59, 999999, tzinfo=timezone.utc),
        )
    elif quarter == 2:
        return (
            datetime(year, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
            datetime(year, 6, 30, 23, 59, 59, 999999, tzinfo=timezone.utc),
        )
    elif quarter == 3:
        return (
            datetime(year, 7, 1, 0, 0, 0, tzinfo=timezone.utc),
            datetime(year, 9, 30, 23, 59, 59, 999999, tzinfo=timezone.utc),
        )
    else:
        return (
            datetime(year, 10, 1, 0, 0, 0, tzinfo=timezone.utc),
            datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=timezone.utc),
        )


def get_quarter_info(dt: datetime) -> Tuple[int, int, str, str, str]:
    q = (dt.month - 1) // 3 + 1
    y = dt.year
    season_id = f"{y}-T{q}"
    name = f"Saison {q} {y} • {SEASONS_LABELS[q]}"
    short_name = f"T{q} {y}"
    return y, q, season_id, name, short_name


def format_date_range_no_parentheses(start_dt: datetime, end_dt: datetime) -> str:
    s_day = start_dt.day
    s_month = MONTHS_SHORT_FR[start_dt.month]
    e_day = end_dt.day
    e_month = MONTHS_SHORT_FR[end_dt.month]
    year = end_dt.year
    return f"{s_day} {s_month} → {e_day} {e_month} {year}"


class SeasonService:
    @staticmethod
    def get_current_season_id() -> str:
        now = datetime.now(timezone.utc)
        _, _, season_id, _, _ = get_quarter_info(now)
        return season_id

    @staticmethod
    def get_season_bounds_by_id(season_id: str) -> Optional[Tuple[datetime, datetime]]:
        try:
            clean = season_id.upper().replace("Q", "T").strip()
            parts = clean.split("-T")
            year = int(parts[0])
            quarter = int(parts[1])
            if quarter < 1 or quarter > 4:
                return None
            return get_quarter_bounds(year, quarter)
        except Exception:
            return None

    @staticmethod
    def filter_matches_by_season(matches: List[Match], season_id: str) -> List[Match]:
        bounds = SeasonService.get_season_bounds_by_id(season_id)
        if not bounds:
            return []
        start_dt, end_dt = bounds
        filtered: List[Match] = []
        for m in matches:
            if not m.is_active:
                continue
            dt = parse_iso(m.played_at or m.created_at or "")
            if start_dt <= dt <= end_dt:
                filtered.append(m)
        return filtered

    @staticmethod
    def list_seasons(
        matches: List[Match],
        players: Optional[List[Player]] = None,
        games: Optional[List[Game]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Lists all detected seasons from matches plus the current active season.
        Calculates high-level metrics and detailed breakdown for each.
        Guarantees NO parentheses in generated text.
        """
        players_map: Dict[str, Player] = {p.id: p for p in (players or [])}
        active_player_ids = set(p.id for p in (players or []) if p.is_active)
        player_images = {p.id: p.image_url for p in (players or [])}

        now = datetime.now(timezone.utc)
        curr_y, curr_q, curr_season_id, curr_name, curr_short = get_quarter_info(now)

        # Find all quarters present in active matches
        seasons_keys: Set[Tuple[int, int]] = {(curr_y, curr_q)}
        for m in matches:
            if not m.is_active:
                continue
            dt = parse_iso(m.played_at or m.created_at or "")
            q = (dt.month - 1) // 3 + 1
            seasons_keys.add((dt.year, q))

        # Sort quarters descending: newest first
        sorted_keys = sorted(list(seasons_keys), key=lambda item: (item[0], item[1]), reverse=True)

        seasons_list: List[Dict[str, Any]] = []
        for year, quarter in sorted_keys:
            season_id = f"{year}-T{quarter}"
            is_current = (year == curr_y and quarter == curr_q)
            name = f"Saison {quarter} {year} • {SEASONS_LABELS[quarter]}"
            short_name = f"T{quarter} {year}"
            start_dt, end_dt = get_quarter_bounds(year, quarter)
            date_range_str = format_date_range_no_parentheses(start_dt, end_dt)

            season_matches = SeasonService.filter_matches_by_season(matches, season_id)

            # Sort matches chronologically
            season_matches.sort(key=lambda m: parse_iso(m.played_at or m.created_at or ""))

            # Stats aggregation
            participating_player_ids = set()
            games_count_map: Dict[str, Dict[str, Any]] = {}
            player_wins: Dict[str, int] = {}

            best_single_score = None
            for m in season_matches:
                # Games count
                g_id = m.game_id or m.game_name
                if g_id not in games_count_map:
                    games_count_map[g_id] = {
                        "id": m.game_id,
                        "name": m.game_name,
                        "image_url": m.game_image_url or "/static/icons/default-game.svg",
                        "matches_count": 0,
                    }
                games_count_map[g_id]["matches_count"] += 1

                for s in m.scores:
                    participating_player_ids.add(s.player_id)
                    if s.is_winner:
                        player_wins[s.player_id] = player_wins.get(s.player_id, 0) + 1

                    if s.score is not None and s.score > 0:
                        if best_single_score is None or s.score > best_single_score["score"]:
                            best_single_score = {
                                "player_id": s.player_id,
                                "player_name": s.player_name,
                                "game_name": m.game_name,
                                "score": s.score,
                            }

            # Top game
            top_game = None
            if games_count_map:
                sorted_games = sorted(games_count_map.values(), key=lambda g: g["matches_count"], reverse=True)
                top_game = sorted_games[0]

            # MVP Player
            mvp = None
            if player_wins:
                sorted_mvp = sorted(player_wins.items(), key=lambda kv: kv[1], reverse=True)
                mvp_id, mvp_wins = sorted_mvp[0]
                mvp_p = players_map.get(mvp_id)
                mvp = {
                    "player_id": mvp_id,
                    "player_name": mvp_p.name if mvp_p else "Joueur",
                    "player_image_url": mvp_p.image_url if mvp_p else None,
                    "matches_won": mvp_wins,
                }

            # Win streak during season
            best_win_streak = None
            current_streaks: Dict[str, int] = {}
            max_streaks: Dict[str, int] = {}
            for match in season_matches:
                for s in match.scores:
                    if s.is_winner:
                        current_streaks[s.player_name] = current_streaks.get(s.player_name, 0) + 1
                        if current_streaks[s.player_name] > max_streaks.get(s.player_name, 0):
                            max_streaks[s.player_name] = current_streaks[s.player_name]
                    else:
                        current_streaks[s.player_name] = 0

            if max_streaks:
                sorted_streaks = sorted(max_streaks.items(), key=lambda kv: kv[1], reverse=True)
                if sorted_streaks[0][1] >= 2:
                    best_win_streak = {
                        "player_name": sorted_streaks[0][0],
                        "streak": sorted_streaks[0][1],
                    }

            # Rivalry during season
            rivalry = None
            pair_counts: Dict[tuple, Dict[str, Any]] = {}
            for match in season_matches:
                pids = [s.player_id for s in match.scores]
                for i in range(len(pids)):
                    for j in range(i + 1, len(pids)):
                        p1_id, p2_id = min(pids[i], pids[j]), max(pids[i], pids[j])
                        key = (p1_id, p2_id)
                        if key not in pair_counts:
                            p1_obj = players_map.get(p1_id)
                            p2_obj = players_map.get(p2_id)
                            pair_counts[key] = {
                                "p1_name": p1_obj.name if p1_obj else "Joueur 1",
                                "p2_name": p2_obj.name if p2_obj else "Joueur 2",
                                "matches_together": 0,
                                "p1_wins": 0,
                                "p2_wins": 0,
                            }
                        pair_counts[key]["matches_together"] += 1
                        for s in match.scores:
                            if s.is_winner:
                                if s.player_id == p1_id:
                                    pair_counts[key]["p1_wins"] += 1
                                elif s.player_id == p2_id:
                                    pair_counts[key]["p2_wins"] += 1

            if pair_counts:
                sorted_rivals = sorted(pair_counts.values(), key=lambda r: r["matches_together"], reverse=True)
                if sorted_rivals[0]["matches_together"] >= 2:
                    rivalry = sorted_rivals[0]

            # Full season leaderboard
            raw_lb = calculate_leaderboard(
                matches=season_matches,
                active_player_ids=active_player_ids,
                player_images=player_images,
            )
            lb_entries: List[Dict[str, Any]] = [
                {
                    "rank": e.rank,
                    "player_id": e.player_id,
                    "player_name": e.player_name,
                    "player_image_url": e.player_image_url,
                    "matches_played": e.matches_played,
                    "matches_won": e.matches_won,
                    "win_ratio": e.win_ratio,
                    "win_percentage": round(e.win_ratio * 100),
                    "score": e.score,
                    "opponents_defeated": e.opponents_defeated,
                    "opponents_faced": e.opponents_faced,
                }
                for e in raw_lb
            ]

            games_list = sorted(games_count_map.values(), key=lambda g: g["matches_count"], reverse=True)

            seasons_list.append({
                "id": season_id,
                "name": name,
                "short_name": short_name,
                "is_current": is_current,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "date_range_str": date_range_str,
                "matches_count": len(season_matches),
                "players_count": len(participating_player_ids),
                "games_count": len(games_count_map),
                "mvp": mvp,
                "top_game": top_game,
                "win_streak": best_win_streak,
                "best_score": best_single_score,
                "rivalry": rivalry,
                "leaderboard": lb_entries,
                "games": games_list,
            })

        return seasons_list
