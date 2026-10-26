"""Unit tests targeting the action history, event-sourcing resolution, and undo/redo logic."""
import pytest
from datetime import datetime, timezone
from app.domain.models import Action, ActionType, EntityType
from app.domain.history import resolve_action_states, get_active_cancelling_undo


def make_action(action_id: str, action_type: ActionType, target_id: str = None) -> Action:
    return Action(
        id=action_id,
        action_type=action_type,
        entity_type=EntityType.ACTION if action_type == ActionType.UNDO_ACTION else EntityType.MATCH,
        entity_id=None,
        target_action_id=target_id,
        summary=f"Summary for {action_id}",
        details={},
        created_at=datetime.now(timezone.utc).isoformat(),
        is_active=True,
    )


def test_single_action_is_active():
    """An action with no undo targeting it is active."""
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    states = resolve_action_states([a1])
    assert states["act-1"] is True


def test_undo_cancels_target_action():
    """Undoing an action cancels the target action while the undo action is active."""
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    u1 = make_action("undo-1", ActionType.UNDO_ACTION, target_id="act-1")

    states = resolve_action_states([a1, u1])
    assert states["act-1"] is False  # act-1 is cancelled
    assert states["undo-1"] is True  # undo-1 is active


def test_undo_of_undo_restores_original_action():
    """
    Undoing an undo action restores the original target action (Redo).
    a1 -> u1 (cancels a1) -> u2 (cancels u1).
    Result: u2 active, u1 cancelled, a1 active again!
    """
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    u1 = make_action("undo-1", ActionType.UNDO_ACTION, target_id="act-1")
    u2 = make_action("undo-2", ActionType.UNDO_ACTION, target_id="undo-1")

    states = resolve_action_states([a1, u1, u2])
    assert states["undo-2"] is True   # latest undo is active
    assert states["undo-1"] is False  # first undo is cancelled
    assert states["act-1"] is True    # original action is restored!


def test_multi_level_undo_chain():
    """
    Test 4-level chain:
    a1 -> u1 (undo a1) -> u2 (undo u1) -> u3 (undo u2)
    Result: u3 active, u2 cancelled, u1 active, a1 cancelled!
    """
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    u1 = make_action("undo-1", ActionType.UNDO_ACTION, target_id="act-1")
    u2 = make_action("undo-2", ActionType.UNDO_ACTION, target_id="undo-1")
    u3 = make_action("undo-3", ActionType.UNDO_ACTION, target_id="undo-2")

    states = resolve_action_states([a1, u1, u2, u3])
    assert states["u3"] if "u3" in states else states["undo-3"] is True
    assert states["undo-2"] is False
    assert states["undo-1"] is True
    assert states["act-1"] is False


def test_independent_actions_unaffected():
    """Undoing action A does not affect action B."""
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    a2 = make_action("act-2", ActionType.RECORD_MATCH)
    u1 = make_action("undo-1", ActionType.UNDO_ACTION, target_id="act-1")

    states = resolve_action_states([a1, a2, u1])
    assert states["act-1"] is False
    assert states["act-2"] is True
    assert states["undo-1"] is True


def test_get_active_cancelling_undo():
    """get_active_cancelling_undo correctly identifies which undo is cancelling an action."""
    a1 = make_action("act-1", ActionType.RECORD_MATCH)
    assert get_active_cancelling_undo("act-1", [a1]) is None

    u1 = make_action("undo-1", ActionType.UNDO_ACTION, target_id="act-1")
    actions = [a1, u1]
    canceller = get_active_cancelling_undo("act-1", actions)
    assert canceller is not None
    assert canceller.id == "undo-1"

    # Now cancel u1 with u2
    u2 = make_action("undo-2", ActionType.UNDO_ACTION, target_id="undo-1")
    actions.append(u2)
    # act-1 is now active, so it has no active cancelling undo
    assert get_active_cancelling_undo("act-1", actions) is None
    # But undo-1 is now cancelled by undo-2!
    canceller_for_u1 = get_active_cancelling_undo("undo-1", actions)
    assert canceller_for_u1 is not None
    assert canceller_for_u1.id == "undo-2"
