"""Models API endpoints for saving and running inference."""

from fastapi import APIRouter, HTTPException
from models.schemas import SaveModelRequest, InferenceRequest, InferenceResponse
from supabase_client import (
    save_model_to_db,
    get_model_from_db,
    get_model_state_dict,
    list_user_models,
    list_playground_models,
)
from training.inference import run_inference_local
import logging
import asyncio
from config import settings

# Import RunPod inference only if enabled
if settings.runpod_enabled:
    from training.runpod_inference import run_inference_runpod_flash

logger = logging.getLogger(__name__)
router = APIRouter(tags=["models"])

# Pending inference requests: request_id -> asyncio.Event
inference_responses: dict[str, dict] = {}
inference_events: dict[str, asyncio.Event] = {}


@router.post("/api/models/save")
async def save_trained_model(request: SaveModelRequest):
    """Save a trained model to Supabase with all metadata.

    Args:
        request: SaveModelRequest containing model data, graph, and metrics

    Returns:
        {model_id: str}
    """
    try:
        model_id = save_model_to_db(
            user_id=request.user_id,
            playground_id=request.playground_id,
            model_name=request.model_name,
            model_state_dict_b64=request.model_state_dict_b64,
            graph_json=request.graph_json.dict(),
            training_config=request.training_config.dict(),
            final_metrics={
                "loss": request.final_metrics.loss,
                "accuracy": request.final_metrics.accuracy,
                "history": request.final_metrics.history,
            },
            description=request.description,
        )

        logger.info(f"Model saved successfully: {model_id}")
        return {"model_id": model_id}

    except Exception as e:
        logger.exception(f"Failed to save model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/models/{model_id}")
async def get_model(model_id: str):
    """Get model metadata.

    Args:
        model_id: Trained model ID

    Returns:
        Model metadata dictionary
    """
    try:
        model_data = get_model_from_db(model_id)
        return model_data

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to get model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/users/{user_id}/models")
async def list_user_trained_models(user_id: str):
    """List all trained models for a user.

    Args:
        user_id: User ID

    Returns:
        List of model metadata
    """
    try:
        models = list_user_models(user_id)
        return {"models": models}

    except Exception as e:
        logger.exception(f"Failed to list user models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/playgrounds/{playground_id}/models")
async def list_playground_trained_models(playground_id: str):
    """List all trained models for a specific playground.

    Args:
        playground_id: Playground ID

    Returns:
        List of model metadata
    """
    try:
        models = list_playground_models(playground_id)
        return {"models": models}

    except Exception as e:
        logger.exception(f"Failed to list playground models: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/models/{model_id}/infer")
async def run_model_inference(model_id: str, request: InferenceRequest):
    """Run inference using a trained model.

    Args:
        model_id: Trained model ID
        request: InferenceRequest with input tensor

    Returns:
        InferenceResponse with output tensor and shape
    """
    try:
        # Fetch model metadata and state dict
        model_data = get_model_from_db(model_id)
        model_state_dict_b64 = get_model_state_dict(model_id)

        # Route to local or RunPod inference
        if settings.runpod_enabled:
            logger.info(f"Running inference on RunPod for model {model_id}")
            result = await run_inference_runpod_flash(
                model_state_dict_b64=model_state_dict_b64,
                graph_json=model_data["graph_json"],
                input_tensor=request.input_tensor,
                model_id=model_id,
                backend_url=settings.backend_url,
            )
        else:
            logger.info(f"Running local inference for model {model_id}")
            result = await run_inference_local(
                model_state_dict_b64=model_state_dict_b64,
                graph_json=model_data["graph_json"],
                input_tensor=request.input_tensor,
            )

        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to run inference: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/models/callback")
async def inference_callback(callback_data: dict):
    """Receive inference results from RunPod.

    Args:
        callback_data: Dict with inference results

    Returns:
        {status: "ok"}
    """
    try:
        request_id = callback_data.get("request_id")

        if not request_id:
            logger.warning("Callback received without request_id")
            raise HTTPException(status_code=400, detail="request_id required")

        # Store result and signal event
        inference_responses[request_id] = callback_data
        if request_id in inference_events:
            inference_events[request_id].set()

        logger.info(f"Inference callback received for request {request_id}")
        return {"status": "ok"}

    except Exception as e:
        logger.exception(f"Failed to handle inference callback: {e}")
        raise HTTPException(status_code=500, detail=str(e))
