"""Session detection and grouping service."""
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.domain.models import Match

GAP_HOURS_THRESHOLD = 4.5

MONTHS_FR = [
    "", "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
]

DAYS_FR = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"
]


def parse_iso(dt_str: str) -> datetime:
    """Parses ISO string to UTC datetime."""
    clean_str = dt_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def get_session_emoji_and_period(start_dt: datetime) -> tuple[str, str]:
    """Returns the contextual emoji and period name based on the hour of the session."""
    hour = start_dt.hour
    if 5 <= hour < 12:
        return "☀️", "Matinée"
    elif 12 <= hour < 18:
        return "🌤️", "Après-midi"
    elif 18 <= hour <= 23:
        return "🌙", "Soirée"
    else:  # 00:00 to 04:59 (Late night)
        return "🌕", "Nuit"


def format_session_title(start_dt: datetime, end_dt: datetime) -> tuple[str, str, str]:
    """
    Formats emoji, user-friendly French session title, and compact date title.
    """
    emoji, period = get_session_emoji_and_period(start_dt)
    day_name = DAYS_FR[start_dt.weekday()]
    month_name = MONTHS_FR[start_dt.month]
    day_num = start_dt.day

    title = f"{emoji} {period} du {day_name} {day_num} {month_name}"
    short_title = f"{emoji} {start_dt.strftime('%d/%m')}"
    return emoji, title, short_title


class SessionService:
    @staticmethod
    def detect_sessions(matches: List[Match]) -> List[Dict[str, Any]]:
        """
        Groups active matches into sessions based on time gaps.
        Returns list of sessions sorted from newest to oldest.
        """
        active_matches = [m for m in matches if m.is_active]
        if not active_matches:
            return []

        # Sort chronologically ascending
        sorted_matches = sorted(
            active_matches,
            key=lambda m: parse_iso(m.played_at or m.created_at or "")
        )

        grouped_match_clusters: List[List[Match]] = []
        current_cluster: List[Match] = []

        for match in sorted_matches:
            match_dt = parse_iso(match.played_at or match.created_at or "")
            if not current_cluster:
                current_cluster.append(match)
            else:
                last_dt = parse_iso(current_cluster[-1].played_at or current_cluster[-1].created_at or "")
                gap_seconds = (match_dt - last_dt).total_seconds()
                if gap_seconds <= GAP_HOURS_THRESHOLD * 3600:
                    current_cluster.append(match)
                else:
                    grouped_match_clusters.append(current_cluster)
                    current_cluster = [match]

        if current_cluster:
            grouped_match_clusters.append(current_cluster)

        # Build session objects
        sessions: List[Dict[str, Any]] = []
        for cluster in grouped_match_clusters:
            start_dt = parse_iso(cluster[0].played_at or cluster[0].created_at or "")
            end_dt = parse_iso(cluster[-1].played_at or cluster[-1].created_at or "")

            # Distinct game names and game objects in order of appearance
            game_names: List[str] = []
            games: List[Dict[str, Any]] = []
            seen_game_ids = set()
            for m in cluster:
                if m.game_name and m.game_name not in game_names:
                    game_names.append(m.game_name)
                if m.game_id and m.game_id not in seen_game_ids:
                    seen_game_ids.add(m.game_id)
                    games.append({
                        "id": m.game_id,
                        "name": m.game_name,
                        "image_url": m.game_image_url or "",
                    })

            # Distinct player IDs
            player_ids: List[str] = []
            for m in cluster:
                for score in m.scores:
                    if score.player_id not in player_ids:
                        player_ids.append(score.player_id)

            match_ids = [m.id for m in cluster]
            session_id = f"session_{cluster[0].id}"
            emoji, title, short_title = format_session_title(start_dt, end_dt)

            sessions.append({
                "id": session_id,
                "name": title,
                "short_name": short_title,
                "emoji": emoji,
                "start_time": cluster[0].played_at or cluster[0].created_at,
                "end_time": cluster[-1].played_at or cluster[-1].created_at,
                "matches_count": len(cluster),
                "games": games,
                "game_names": game_names,
                "player_ids": player_ids,
                "match_ids": match_ids,
            })

        # Return reverse chronological (newest session first)
        sessions.reverse()
        return sessions

    @staticmethod
    def get_session_details(
        session: Dict[str, Any],
        matches: List[Match],
        players_map: Dict[str, Any],
        games_map: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Computes comprehensive cross-referenced statistics and timeline for a given session.
        """
        match_ids_set = set(session.get("match_ids", []))
        session_matches = [m for m in matches if m.id in match_ids_set]
        session_matches.sort(key=lambda m: parse_iso(m.played_at or m.created_at or ""))

        start_dt = parse_iso(session["start_time"])
        end_dt = parse_iso(session["end_time"])
        total_seconds = max(0, int((end_dt - start_dt).total_seconds()))
        total_mins = total_seconds // 60
        h = total_mins // 60
        m = total_mins % 60
        if total_mins < 5:
            duration_str = "Moins de 5 min"
        elif h == 0:
            duration_str = f"{m} min"
        elif m == 0:
            duration_str = f"{h}h"
        else:
            duration_str = f"{h}h {m:02d}min"

        # Leaderboard of the session
        player_stats: Dict[str, Dict[str, Any]] = {}
        for match in session_matches:
            for s in match.scores:
                pid = s.player_id
                if pid not in player_stats:
                    p_obj = players_map.get(pid)
                    player_stats[pid] = {
                        "player_id": pid,
                        "player_name": s.player_name,
                        "player_image_url": p_obj.image_url if p_obj else None,
                        "matches_played": 0,
                        "matches_won": 0,
                        "total_score": 0.0,
                        "highest_score": None,
                    }
                stat = player_stats[pid]
                stat["matches_played"] += 1
                if s.is_winner:
                    stat["matches_won"] += 1
                if s.score is not None:
                    stat["total_score"] += s.score
                    if stat["highest_score"] is None or s.score > stat["highest_score"]:
                        stat["highest_score"] = s.score

        leaderboard: List[Dict[str, Any]] = []
        for pid, stat in player_stats.items():
            mp = stat["matches_played"]
            mw = stat["matches_won"]
            ratio = round(mw / mp, 3) if mp > 0 else 0.0
            avg_score = round(stat["total_score"] / mp, 1) if mp > 0 else 0.0
            leaderboard.append({
                "player_id": pid,
                "player_name": stat["player_name"],
                "player_image_url": stat["player_image_url"],
                "matches_played": mp,
                "matches_won": mw,
                "win_ratio": ratio,
                "win_percentage": int(round(ratio * 100)),
                "total_score": round(stat["total_score"], 1),
                "highest_score": stat["highest_score"],
                "average_score": avg_score,
            })

        # Sort: wins desc, ratio desc, total_score desc
        leaderboard.sort(key=lambda x: (x["matches_won"], x["win_ratio"], x["total_score"]), reverse=True)
        for idx, entry in enumerate(leaderboard, 1):
            entry["rank"] = idx

        # MVP
        mvp = leaderboard[0] if leaderboard and leaderboard[0]["matches_won"] > 0 else (leaderboard[0] if leaderboard else None)

        # Games stats in session
        games_dict: Dict[str, Dict[str, Any]] = {}
        for match in session_matches:
            gid = match.game_id or "unknown"
            if gid not in games_dict:
                g_obj = games_map.get(gid)
                games_dict[gid] = {
                    "id": gid,
                    "name": match.game_name,
                    "image_url": match.game_image_url or (g_obj.image_url if g_obj else "/static/icons/default-game.svg"),
                    "matches_count": 0,
                    "winners": [],
                }
            games_dict[gid]["matches_count"] += 1
            for s in match.scores:
                if s.is_winner and s.player_name not in games_dict[gid]["winners"]:
                    games_dict[gid]["winners"].append(s.player_name)

        games_list = sorted(games_dict.values(), key=lambda g: g["matches_count"], reverse=True)
        top_game = games_list[0] if games_list else None

        # Best individual score
        best_single_score = None
        for match in session_matches:
            for s in match.scores:
                if s.score and s.score > 0:
                    if best_single_score is None or s.score > best_single_score["score"]:
                        best_single_score = {
                            "player_name": s.player_name,
                            "game_name": match.game_name,
                            "score": s.score,
                        }

        # Longest consecutive win streak during session
        best_win_streak = None
        current_streaks: Dict[str, int] = {}
        max_streaks: Dict[str, int] = {}
        for match in session_matches:
            winners = {s.player_id: s.player_name for s in match.scores if s.is_winner}
            for pid, pname in winners.items():
                current_streaks[pname] = current_streaks.get(pname, 0) + 1
                if current_streaks[pname] > max_streaks.get(pname, 0):
                    max_streaks[pname] = current_streaks[pname]
            # Reset streaks for players in this match who did not win
            for s in match.scores:
                if not s.is_winner and s.player_name in current_streaks:
                    current_streaks[s.player_name] = 0

        if max_streaks:
            sorted_streaks = sorted(max_streaks.items(), key=lambda kv: kv[1], reverse=True)
            if sorted_streaks[0][1] >= 2:
                best_win_streak = {
                    "player_name": sorted_streaks[0][0],
                    "streak": sorted_streaks[0][1],
                }

        # Head-to-head rivalry (pair with most matches together)
        rivalry = None
        pair_counts: Dict[tuple, Dict[str, Any]] = {}
        for match in session_matches:
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

        # Chronological matches list
        formatted_matches: List[Dict[str, Any]] = []
        for match in session_matches:
            dt = parse_iso(match.played_at or match.created_at or "")
            winners = [s.player_name for s in match.scores if s.is_winner]
            scores_list = []
            for s in match.scores:
                p_obj = players_map.get(s.player_id)
                scores_list.append({
                    "player_id": s.player_id,
                    "player_name": s.player_name,
                    "score": s.score,
                    "is_winner": s.is_winner,
                    "image_url": p_obj.image_url if p_obj else None,
                })
            # Sort scores: winners first, then score desc
            scores_list.sort(key=lambda s: (s["is_winner"], s["score"] or 0), reverse=True)

            formatted_matches.append({
                "id": match.id,
                "game_id": match.game_id,
                "game_name": match.game_name,
                "game_image_url": match.game_image_url or "/static/icons/default-game.svg",
                "time_str": dt.strftime("%H:%M"),
                "winners": winners,
                "scores": scores_list,
            })

        return {
            "id": session["id"],
            "name": session["name"],
            "short_name": session.get("short_name", session["name"]),
            "emoji": session.get("emoji", "🌙"),
            "start_time": session["start_time"],
            "end_time": session["end_time"],
            "duration_str": duration_str,
            "matches_count": len(session_matches),
            "players_count": len(player_stats),
            "games_count": len(games_dict),
            "mvp": mvp,
            "top_game": top_game,
            "win_streak": best_win_streak,
            "best_score": best_single_score,
            "rivalry": rivalry,
            "leaderboard": leaderboard,
            "games": games_list,
            "matches": formatted_matches,
        }
