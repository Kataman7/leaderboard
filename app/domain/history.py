"""Domain logic for event-sourcing, action history, undo/redo resolution, and leaderboard computation."""
from typing import List, Dict, Set, Optional
from app.domain.models import (
    Action,
    ActionType,
    PlayerLeaderboardEntry,
    Match,
)


def resolve_action_states(actions: List[Action]) -> Dict[str, bool]:
    """
    Computes the effective active status (True = active, False = cancelled)
    for every action in the history.

    Rules:
    - An action is active by default.
    - An action is cancelled if and only if there is at least one ACTIVE UNDO_ACTION
      whose `target_action_id` is this action's ID.
    - Since undo actions can only target actions created before them, we evaluate
      from newest to oldest (reverse chronological) or via memoized recursion.
    - If Action A is undone by Action B, and Action B is undone by Action C,
      then Action C is active -> Action B is cancelled -> Action A is restored (active)!
    """
    actions_by_id: Dict[str, Action] = {a.id: a for a in actions}
    # Map target_action_id -> list of undo actions targeting it
    target_to_undos: Dict[str, List[Action]] = {}
    for a in actions:
        if a.action_type == ActionType.UNDO_ACTION and a.target_action_id:
            target_to_undos.setdefault(a.target_action_id, []).append(a)

    cache: Dict[str, bool] = {}

    def is_active(action_id: str) -> bool:
        if action_id in cache:
            return cache[action_id]

        action = actions_by_id.get(action_id)
        if not action:
            # If target action not found in action list, treat as not active
            return False

        # Find all undo actions targeting this action
        direct_undos = target_to_undos.get(action_id, [])
        # Check if ANY of these direct undo actions is currently active
        has_active_undo = any(is_active(undo.id) for undo in direct_undos)

        # If it has an active undo targeting it, this action is cancelled (not active)
        result = not has_active_undo
        cache[action_id] = result
        return result

    status_map: Dict[str, bool] = {}
    for a in actions:
        status_map[a.id] = is_active(a.id)

    return status_map


def get_active_cancelling_undo(action_id: str, actions: List[Action]) -> Optional[Action]:
    """
    Finds the active UNDO_ACTION that is currently cancelling `action_id`, if any.
    This allows reinstating `action_id` by undoing this cancelling action.
    """
    states = resolve_action_states(actions)
    if states.get(action_id, True):
        # Action is already active, not cancelled
        return None

    # Look for undo actions targeting action_id that are active
    for a in actions:
        if (
            a.action_type == ActionType.UNDO_ACTION
            and a.target_action_id == action_id
            and states.get(a.id, False)
        ):
            return a
    return None


def calculate_leaderboard(
    matches: List[Match],
    game_id: Optional[str] = None,
    active_player_ids: Optional[Set[str]] = None,
) -> List[PlayerLeaderboardEntry]:
    """
    Calculates leaderboard rankings based on active matches.
    If game_id is specified, computes stats for that specific game.
    Otherwise computes global leaderboard across all games.
    If active_player_ids is provided, excludes players that are cancelled/inactive.

    Sorting criteria:
    1. Win ratio descending (wins / matches)
    2. Total wins descending (tie breaker)
    3. Total matches played descending (tie breaker)
    4. Average score descending (tie breaker)
    """
    stats: Dict[str, Dict] = {}

    for match in matches:
        if not match.is_active:
            continue
        if game_id and match.game_id != game_id:
            continue

        for s in match.scores:
            pid = s.player_id
            if active_player_ids is not None and pid not in active_player_ids:
                continue

            if pid not in stats:
                stats[pid] = {
                    "player_id": pid,
                    "player_name": s.player_name,
                    "matches_played": 0,
                    "matches_won": 0,
                    "total_score": 0.0,
                    "highest_score": s.score,
                }

            stats[pid]["matches_played"] += 1
            if s.is_winner:
                stats[pid]["matches_won"] += 1
            stats[pid]["total_score"] += s.score
            if stats[pid]["highest_score"] is None or s.score > stats[pid]["highest_score"]:
                stats[pid]["highest_score"] = s.score

    entries: List[PlayerLeaderboardEntry] = []
    for pid, data in stats.items():
        played = data["matches_played"]
        won = data["matches_won"]
        ratio = round(won / played, 4) if played > 0 else 0.0
        avg_score = round(data["total_score"] / played, 2) if played > 0 else 0.0

        entries.append(
            PlayerLeaderboardEntry(
                player_id=pid,
                player_name=data["player_name"],
                matches_played=played,
                matches_won=won,
                win_ratio=ratio,
                total_score=data["total_score"],
                highest_score=data["highest_score"],
                average_score=avg_score,
            )
        )

    # Sort
    entries.sort(
        key=lambda e: (
            e.win_ratio,
            e.matches_won,
            e.matches_played,
            e.average_score
        ),
        reverse=True,
    )

    # Assign ranks
    for index, entry in enumerate(entries, start=1):
        entry.rank = index

    return entries
