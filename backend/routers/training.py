"""Training endpoints with WebSocket streaming."""

from __future__ import annotations
import asyncio
import logging
import uuid
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from supabase import create_client
from models.schemas import TrainingRequest, GraphSchema, TrainingConfig
from compiler.normalize_graph import normalize_graph
from compiler.validator import validate_graph, ValidationError
from training.trainer import train_model
from training.datasets import register_custom_dataset
from storage import generate_signed_url, generate_signed_upload_url
from config import settings

# Import RunPod Flash trainer only if enabled
if settings.runpod_enabled:
    from training.runpod_flash_trainer import train_model_flash

logger = logging.getLogger(__name__)
router = APIRouter(tags=["training"])


def _runpod_callback_url() -> str | None:
    """URL to give RunPod for callbacks, or None if RunPod cannot reach this backend (e.g. localhost)."""
    if not settings.runpod_callback_enabled:
        return None
    url = (settings.backend_url or "").strip().lower()
    if not url or "localhost" in url or "127.0.0.1" in url:
        return None
    return settings.backend_url.strip()

# Pending jobs: job_id -> TrainingRequest (stored between POST and WS connect)
pending_jobs: dict[str, TrainingRequest] = {}
# Active stop events: job_id -> asyncio.Event
stop_events: dict[str, asyncio.Event] = {}
# Active WebSocket connections: job_id -> WebSocket
active_connections: dict[str, WebSocket] = {}


@router.post("/api/training/start")
async def start_training(request: TrainingRequest):
    """Start a training job. Returns a job_id to connect via WebSocket."""
    graph = normalize_graph(request.graph)
    try:
        validate_graph(graph)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    job_id = str(uuid.uuid4())[:8]
    pending_jobs[job_id] = TrainingRequest(graph=graph, dataset_id=request.dataset_id, training_config=request.training_config)
    stop_events[job_id] = asyncio.Event()

    return {"job_id": job_id}


@router.post("/api/training/{job_id}/stop")
async def stop_training(job_id: str):
    """Stop a running training job."""
    if job_id not in stop_events:
        raise HTTPException(status_code=404, detail="Job not found")
    stop_events[job_id].set()
    return {"status": "stopping"}


@router.post("/api/training/{job_id}/callback")
async def training_callback(job_id: str, callback_data: dict):
    """Receive epoch updates from RunPod during training.

    This endpoint is called from RunPod after each epoch completes.
    It forwards the epoch data to the connected WebSocket client.

    Args:
        job_id: Training job identifier
        callback_data: Dict with epoch metrics (type, epoch, train_loss, val_loss, etc.)

    Returns:
        200 OK if callback was forwarded, 404 if job not found
    """
    # Check if WebSocket is connected for this job
    if job_id not in active_connections:
        logger.warning("Callback received for unknown job_id=%s (WebSocket may have disconnected)", job_id)
        raise HTTPException(status_code=404, detail="Job not found or WebSocket disconnected")

    websocket = active_connections[job_id]

    try:
        # Log the callback
        if callback_data.get("type") == "epoch":
            logger.info("Callback epoch job_id=%s epoch=%s train_loss=%s val_loss=%s train_acc=%s val_acc=%s",
                       job_id, callback_data.get("epoch"), callback_data.get("train_loss"),
                       callback_data.get("val_loss"), callback_data.get("train_acc"), callback_data.get("val_acc"))
        elif callback_data.get("type") == "completed":
            logger.info("Callback completed job_id=%s", job_id)

        # Forward epoch data to WebSocket client
        await websocket.send_json(callback_data)
        return {"status": "ok"}
    except Exception as e:
        logger.exception("Failed to forward callback to WebSocket job_id=%s: %s", job_id, e)
        # Remove from active connections if WebSocket is dead
        active_connections.pop(job_id, None)
        raise HTTPException(status_code=500, detail="Failed to forward callback")


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

    # Track active connection for callbacks
    active_connections[job_id] = websocket

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

    # Register custom dataset if needed (before training starts)
    custom_dataset_meta = None
    custom_dataset_signed_url = None
    if request.dataset_id.startswith("custom:"):
        try:
            raw_uuid = request.dataset_id.removeprefix("custom:")
            sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
            result = sb.table("datasets").select("*").eq("id", raw_uuid).single().execute()
            if not result.data:
                await ws_callback({"type": "error", "message": "Custom dataset not found"})
                return
            custom_dataset_meta = result.data
            custom_dataset_signed_url = generate_signed_url(custom_dataset_meta["gcs_path"], expiration_hours=2)
            register_custom_dataset(request.dataset_id, custom_dataset_meta, custom_dataset_signed_url)
        except Exception as e:
            logger.exception("Failed to load custom dataset metadata: %s", e)
            await ws_callback({"type": "error", "message": f"Failed to load custom dataset: {e}"})
            return

    try:
        # Route to RunPod Flash or local training
        if settings.runpod_enabled:
            logger.info("Starting RunPod Flash training job_id=%s dataset_id=%s epochs=%s", job_id, request.dataset_id, request.training_config.epochs)
            await train_with_runpod_flash(request, ws_callback, stop_event, job_id, custom_dataset_meta, custom_dataset_signed_url)
        else:
            logger.info("Starting local training job_id=%s dataset_id=%s epochs=%s", job_id, request.dataset_id, request.training_config.epochs)
            await train_model(
                graph=request.graph,  # already normalized at start_training
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
        active_connections.pop(job_id, None)
        try:
            await websocket.close()
        except Exception:
            pass


async def train_with_runpod_flash(request, ws_callback, stop_event, job_id=None, custom_dataset_meta=None, custom_dataset_signed_url=None):
    """Execute training on RunPod Flash and send results."""
    try:
        # Send started message
        await ws_callback({
            "type": "started",
            "message": "Training started on RunPod GPU..."
        })

        # Only pass a callback URL if RunPod can reach this backend (not localhost)
        callback_url = _runpod_callback_url()
        logger.info(f"Calling RunPod Flash with callback_url={callback_url}")

        try:
            # Generate a signed upload URL so RunPod can upload the model to GCS
            # instead of returning it in the response (which has size limits)
            model_gcs_path = f"models/{job_id}/model_state_dict.pt"
            model_upload_url = generate_signed_upload_url(model_gcs_path, expiration_hours=2)

            flash_kwargs = dict(
                graph_dict=request.graph.dict(),
                dataset_id=request.dataset_id,
                config_dict=request.training_config.dict(),
                job_id=job_id,
                backend_url=callback_url,
                model_upload_url=model_upload_url,
            )
            if custom_dataset_meta and custom_dataset_signed_url:
                flash_kwargs["custom_dataset_meta"] = custom_dataset_meta
                flash_kwargs["custom_dataset_signed_url"] = custom_dataset_signed_url
            result = await train_model_flash(**flash_kwargs)
        except Exception as e:
            logger.error(f"RunPod Flash call failed: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            await ws_callback({
                "type": "error",
                "message": f"RunPod error: {str(e)}",
                "details": traceback.format_exc()
            })
            return

        logger.info(f"RunPod Flash training completed: {result.get('type')}")
        logger.info(f"RunPod result keys: {result.keys()}")

        # Check if it's an error
        if result.get("type") == "error":
            await ws_callback(result)
            return

        # Send epoch updates from history
        # If we passed a callback URL, RunPod already sent epoch updates via HTTP
        # Otherwise replay from the returned history
        history = result.get("history", {})
        logger.info(f"History type: {type(history)}, History keys: {history.keys() if isinstance(history, dict) else 'N/A'}")

        epochs_list = history.get("epochs", [])

        if callback_url and job_id:
            logger.info(f"Callbacks enabled: skipping epoch replay (updates already sent via HTTP callbacks)")
        else:
            logger.info(f"Number of epochs to replay: {len(epochs_list)}")
            for idx, epoch_data in enumerate(epochs_list):
                if stop_event.is_set():
                    await ws_callback({"type": "stopped"})
                    return

                logger.info(f"Replaying epoch {idx+1}/{len(epochs_list)}: epoch={epoch_data.get('epoch')}")
                try:
                    await ws_callback({
                        "type": "epoch",
                        **epoch_data
                    })
                except Exception as e:
                    logger.exception(f"Failed to send epoch message: {e}")
                    raise
                # Small delay so frontend can process updates
                await asyncio.sleep(0.1)

            logger.info(f"All {len(epochs_list)} epochs replayed successfully")

        # Download model from GCS if it was uploaded there
        model_b64 = result.get("model_state_dict_b64")
        model_size = result.get("model_size_bytes")
        if not model_b64 and result.get("model_gcs_path"):
            try:
                import requests as http_requests
                download_url = generate_signed_url(result["model_gcs_path"], expiration_hours=1)
                resp = http_requests.get(download_url, timeout=120)
                resp.raise_for_status()
                import base64
                model_b64 = base64.b64encode(resp.content).decode()
                model_size = len(resp.content)
                logger.info("Downloaded model from GCS: %d bytes", model_size)
            except Exception as e:
                logger.exception("Failed to download model from GCS: %s", e)

        # Send final completion message
        await ws_callback({
            "type": "completed",
            "final_metrics": result.get("final_metrics"),
            "model_state_dict_b64": model_b64,
            "model_size_bytes": model_size
        })

    except Exception as e:
        logger.exception(f"RunPod Flash training failed: {e}")
        await ws_callback({"type": "error", "message": str(e)})
