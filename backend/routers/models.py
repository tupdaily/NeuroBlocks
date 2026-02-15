"""Models API endpoints for saving and running inference."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from models.schemas import SaveModelRequest, InferenceRequest, InferenceResponse, ShapeValidationError
from supabase_client import (
    save_model_to_db,
    get_model_from_db,
    get_model_state_dict,
    list_user_models,
    list_playground_models,
)
from training.inference import run_inference_local
from training.input_processor import process_input
from training.shape_validator import validate_input_shape, infer_expected_shape_from_input_node
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

        # Estimate payload size — RunPod has request size limits
        # Each float in JSON is ~8 chars; limit to ~10MB
        total_floats = sum(len(row) for row in request.input_tensor)
        payload_too_large = total_floats > 500_000

        # Route to local or RunPod inference
        if settings.runpod_enabled and not payload_too_large:
            logger.info(f"Running inference on RunPod for model {model_id}")
            result = await run_inference_runpod_flash(
                model_state_dict_b64=model_state_dict_b64,
                graph_json=model_data["graph_json"],
                input_tensor=request.input_tensor,
                model_id=model_id,
                backend_url=settings.backend_url,
            )
        else:
            if payload_too_large:
                logger.info(f"Input too large for RunPod ({total_floats} floats), using local inference for model {model_id}")
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


@router.post("/api/models/{model_id}/infer/file")
async def run_model_inference_with_file(
    model_id: str,
    input_type: str = Form(...),  # "image" | "text" | "tensor"
    file: UploadFile | None = File(None),
    text_content: str | None = Form(None),
    image_width: int | None = Form(None),
    image_height: int | None = Form(None),
    image_channels: int | None = Form(None),
):
    """Run inference with multi-format input (image, text, or tensor file).

    Args:
        model_id: Trained model ID
        input_type: "image" | "text" | "tensor"
        file: Uploaded file (for image or tensor)
        text_content: Text string (for text input)
        image_width, image_height, image_channels: Optional overrides for image

    Returns:
        InferenceResponse or ShapeValidationError (400) if shape mismatch
    """
    try:
        # Fetch model metadata
        model_data = get_model_from_db(model_id)
        graph_json = model_data["graph_json"]

        # Get expected input shape from model
        expected_shape = infer_expected_shape_from_input_node(graph_json)
        if not expected_shape:
            raise ValueError("Could not determine model's expected input shape")

        # Initialize OpenAI client if needed
        openai_client = None
        if input_type == "text":
            try:
                from openai import OpenAI
                openai_client = OpenAI(api_key=settings.openai_api_key)
            except Exception as e:
                logger.error(f"OpenAI client initialization failed: {e}")
                raise ValueError("OpenAI API not configured for text embeddings")

        # Read file bytes if provided
        file_bytes = None
        filename = None
        if file:
            file_bytes = await file.read()
            filename = file.filename

        # Process input based on type
        result = await process_input(
            input_type=input_type,
            file_bytes=file_bytes,
            text_content=text_content,
            filename=filename,
            openai_client=openai_client,
            image_width=image_width,
            image_height=image_height,
            image_channels=image_channels,
        )

        # Check for processing errors
        if result.get("error"):
            raise ValueError(result["error"])

        tensor_data = result["tensor_data"]
        actual_shape = result["actual_shape"]

        if not tensor_data or not actual_shape:
            raise ValueError("Failed to process input")

        # Validate shape
        validation = validate_input_shape(actual_shape, expected_shape, model_id)

        if not validation["valid"]:
            # Return shape mismatch error (400 Bad Request)
            raise HTTPException(
                status_code=400,
                detail={
                    "error": validation["error"],
                    "message": validation["message"],
                    "expected_shape": validation["expected_shape"],
                    "actual_shape": validation["actual_shape"],
                    "suggestion": validation["suggestion"],
                },
            )

        logger.info(
            f"Shape validation passed for model {model_id}: "
            f"expected {expected_shape}, got {actual_shape}"
        )

        # Get model state dict
        model_state_dict_b64 = get_model_state_dict(model_id)

        # Estimate payload size — RunPod has request size limits
        total_floats = sum(len(row) for row in tensor_data)
        payload_too_large = total_floats > 500_000

        # Route to local or RunPod inference
        if settings.runpod_enabled and not payload_too_large:
            logger.info(f"Running inference on RunPod for model {model_id}")
            inference_result = await run_inference_runpod_flash(
                model_state_dict_b64=model_state_dict_b64,
                graph_json=graph_json,
                input_tensor=tensor_data,
                model_id=model_id,
                backend_url=settings.backend_url,
            )
        else:
            if payload_too_large:
                logger.info(f"Input too large for RunPod ({total_floats} floats), using local inference for model {model_id}")
            else:
                logger.info(f"Running local inference for model {model_id}")
            inference_result = await run_inference_local(
                model_state_dict_b64=model_state_dict_b64,
                graph_json=graph_json,
                input_tensor=tensor_data,
            )

        return inference_result

    except HTTPException:
        raise
    except ValueError as e:
        logger.exception(f"Input validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to run file-based inference: {e}")
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
