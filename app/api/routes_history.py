"""API endpoints for action history and undo/redo operations."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from app.api.schemas import HistoryItemResponse, UndoActionRequest, ReinstateActionRequest
from app.api.dependencies import get_history_service
from app.services.history_service import HistoryService

router = APIRouter(prefix="/api/history", tags=["History"])


@router.get("", response_model=List[HistoryItemResponse])
def get_history(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    history_service: HistoryService = Depends(get_history_service),
):
    items = history_service.get_history(limit=limit, offset=offset)
    return [HistoryItemResponse(**item) for item in items]


@router.post("/{action_id}/undo", response_model=HistoryItemResponse)
def undo_action(
    action_id: str,
    payload: Optional[UndoActionRequest] = Body(None),
    history_service: HistoryService = Depends(get_history_service),
):
    try:
        cancelled_by = payload.cancelled_by if payload else None
        undo_action = history_service.undo_action(action_id, cancelled_by=cancelled_by)
        # Fetch fresh view of the newly created undo action
        history_items = history_service.get_history(limit=5)
        for item in history_items:
            if item["id"] == undo_action.id:
                return HistoryItemResponse(**item)
        return HistoryItemResponse(
            id=undo_action.id,
            action_type=undo_action.action_type.value,
            entity_type=undo_action.entity_type.value,
            entity_id=undo_action.entity_id,
            target_action_id=undo_action.target_action_id,
            summary=undo_action.summary,
            details=undo_action.details,
            created_at=undo_action.created_at,
            is_active=True,
            can_undo=True,
            can_reinstate=False,
            cancelling_undo_id=None,
            cancelled_by=cancelled_by,
            cancelled_at=undo_action.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{action_id}/reinstate", response_model=HistoryItemResponse)
def reinstate_action(
    action_id: str,
    payload: Optional[ReinstateActionRequest] = Body(None),
    history_service: HistoryService = Depends(get_history_service),
):
    try:
        reinstated_by = payload.reinstated_by if payload else None
        reinstate_action = history_service.reinstate_action(action_id, reinstated_by=reinstated_by)
        history_items = history_service.get_history(limit=5)
        for item in history_items:
            if item["id"] == reinstate_action.id:
                return HistoryItemResponse(**item)
        return HistoryItemResponse(
            id=reinstate_action.id,
            action_type=reinstate_action.action_type.value,
            entity_type=reinstate_action.entity_type.value,
            entity_id=reinstate_action.entity_id,
            target_action_id=reinstate_action.target_action_id,
            summary=reinstate_action.summary,
            details=reinstate_action.details,
            created_at=reinstate_action.created_at,
            is_active=True,
            can_undo=True,
            can_reinstate=False,
            cancelling_undo_id=None,
            cancelled_by=reinstated_by,
            cancelled_at=reinstate_action.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
