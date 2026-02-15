"""Local inference function for trained models."""

import torch
import base64
import io
import time
import logging
from typing import Any
from compiler.model_builder import build_model
from models.schemas import GraphSchema, InferenceResponse

logger = logging.getLogger(__name__)


async def run_inference_local(
    model_state_dict_b64: str,
    graph_json: dict[str, Any],
    input_tensor: list[list[float]],
) -> InferenceResponse:
    """Run inference on a trained model locally.

    Args:
        model_state_dict_b64: Base64-encoded model state dict
        graph_json: Graph schema as dictionary
        input_tensor: Input tensor as 2D list [batch_size, features...]

    Returns:
        InferenceResponse with model output
    """
    try:
        start_time = time.time()

        # Decode model state dict
        logger.info("Decoding model state dict...")
        model_bytes = base64.b64decode(model_state_dict_b64)
        state_dict = torch.load(io.BytesIO(model_bytes), map_location="cpu")

        # Rebuild model from graph
        logger.info("Rebuilding model from graph...")
        if isinstance(graph_json, dict):
            graph_json = GraphSchema(**graph_json)
        model = build_model(graph_json)
        model.load_state_dict(state_dict)
        model.eval()

        # Move to device
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)

        # Convert input to tensor and move to device
        input_tensor_torch = torch.tensor(input_tensor, dtype=torch.float32, device=device)

        # Run inference
        logger.info(f"Running inference with input shape {input_tensor_torch.shape}...")
        with torch.no_grad():
            output = model(input_tensor_torch)

        # Convert output to list
        output_np = output.cpu().numpy().tolist()

        inference_time_ms = (time.time() - start_time) * 1000

        logger.info(f"Inference completed in {inference_time_ms:.2f}ms, output shape: {output.shape}")

        return InferenceResponse(
            output=output_np,
            shape=list(output.shape),
            inference_time_ms=inference_time_ms,
        )

    except Exception as e:
        logger.exception(f"Local inference failed: {e}")
        raise
