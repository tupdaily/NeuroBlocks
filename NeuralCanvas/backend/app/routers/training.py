"""Training endpoints with WebSocket streaming."""

from __future__ import annotations
import asyncio
import logging
import uuid
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from app.models.schemas import TrainingRequest, GraphSchema, TrainingConfig
from app.compiler.validator import validate_graph, ValidationError
from app.training.trainer import train_model

logger = logging.getLogger(__name__)
router = APIRouter(tags=["training"])

# Pending jobs: job_id -> TrainingRequest (stored between POST and WS connect)
pending_jobs: dict[str, TrainingRequest] = {}
# Active stop events: job_id -> asyncio.Event
stop_events: dict[str, asyncio.Event] = {}


@router.post("/api/training/start")
async def start_training(request: TrainingRequest):
    """Start a training job. Returns a job_id to connect via WebSocket."""
    try:
        validate_graph(request.graph)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    job_id = str(uuid.uuid4())[:8]
    pending_jobs[job_id] = request
    stop_events[job_id] = asyncio.Event()

    return {"job_id": job_id}


@router.post("/api/training/{job_id}/stop")
async def stop_training(job_id: str):
    """Stop a running training job."""
    if job_id not in stop_events:
        raise HTTPException(status_code=404, detail="Job not found")
    stop_events[job_id].set()
    return {"status": "stopping"}


@router.websocket("/ws/training/{job_id}")
async def training_websocket(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time training metrics.

    Flow: POST /api/training/start -> get job_id -> connect WS -> training runs
    """
    logger.info("Training WebSocket connection attempt job_id=%s", job_id)
    await websocket.accept()
    logger.info("Training WebSocket accepted job_id=%s (client should receive 'connected' now)", job_id)

    if job_id not in pending_jobs:
        logger.warning("Training WebSocket job_id=%s not in pending_jobs (client connected too late?)", job_id)
        await websocket.send_json({"type": "error", "message": "Job not found"})
        await websocket.close()
        return

    request = pending_jobs.pop(job_id)
    stop_event = stop_events[job_id]

    # Tell client we're connected so it can show "Preparing…" instead of "Connecting…"
    await websocket.send_json({"type": "connected", "message": "Preparing training…"})
    logger.info("Training WebSocket sent 'connected' job_id=%s", job_id)

    async def ws_callback(msg: dict):
        try:
            mtype = msg.get("type", "")
            if mtype == "batch":
                logger.debug("Training batch job_id=%s epoch=%s batch=%s loss=%s", job_id, msg.get("epoch"), msg.get("batch"), msg.get("loss"))
            elif mtype == "epoch":
                logger.info("Training epoch job_id=%s epoch=%s train_loss=%s val_loss=%s train_acc=%s val_acc=%s", job_id, msg.get("epoch"), msg.get("train_loss"), msg.get("val_loss"), msg.get("train_acc"), msg.get("val_acc"))
            await websocket.send_json(msg)
        except Exception as e:
            logger.exception("Training WebSocket send failed job_id=%s: %s", job_id, e)
            stop_event.set()

    # Listen for stop commands from client in a background task
    async def listen_for_commands():
        try:
            while not stop_event.is_set():
                try:
                    data = await asyncio.wait_for(
                        websocket.receive_text(), timeout=1.0
                    )
                    msg = json.loads(data)
                    if msg.get("type") == "stop":
                        stop_event.set()
                        break
                except asyncio.TimeoutError:
                    continue
        except WebSocketDisconnect:
            stop_event.set()
        except Exception:
            stop_event.set()

    listener_task = asyncio.create_task(listen_for_commands())

    try:
        logger.info("Training starting job_id=%s dataset_id=%s epochs=%s", job_id, request.dataset_id, request.training_config.epochs)
        await train_model(
            graph=request.graph,
            dataset_id=request.dataset_id,
            config=request.training_config,
            ws_callback=ws_callback,
            stop_event=stop_event,
        )
        logger.info("Training finished job_id=%s", job_id)
    except Exception as e:
        logger.exception("Training failed job_id=%s: %s", job_id, e)
        await ws_callback({"type": "error", "message": str(e)})
    finally:
        listener_task.cancel()
        stop_events.pop(job_id, None)
        try:
            await websocket.close()
        except Exception:
            pass
