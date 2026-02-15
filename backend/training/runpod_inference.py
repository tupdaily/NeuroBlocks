"""RunPod Flash remote inference function."""

from runpod_flash import remote, LiveServerless, GpuGroup
import asyncio
import logging

logger = logging.getLogger(__name__)

# Configure GPU resources for inference (smaller than training)
gpu_config_inference = LiveServerless(
    name="aiplayground-inference-v1",
    gpus=[GpuGroup.AMPERE_24],
    workersMax=2,
    workersMin=0,
    idleTimeout=300,
)


@remote(
    resource_config=gpu_config_inference,
    dependencies=[
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "pydantic==2.10.4",
        "git+https://github.com/Ryan6407/AIPlayground.git#subdirectory=backend",
        "requests>=2.28.0",
    ],
)
async def infer_model_flash(
    model_state_dict_b64: str,
    graph_dict: dict,
    input_tensor: list[list[float]],
    request_id: str,
    model_id: str,
    backend_url: str,
):
    """
    Remote inference function that runs on RunPod Flash GPU.

    Args:
        model_state_dict_b64: Base64-encoded model state dict
        graph_dict: GraphSchema as dict
        input_tensor: Input tensor as 2D list [batch_size, features...]
        request_id: Unique request identifier
        model_id: Model ID (for reference)
        backend_url: Backend URL for callbacks

    Returns:
        Dict with inference results
    """
    import torch
    import base64
    import io
    import time

    from compiler.model_builder import build_model
    from models.schemas import GraphSchema
    import requests

    try:
        start_time = time.time()

        # Decode model
        model_bytes = base64.b64decode(model_state_dict_b64)
        state_dict = torch.load(io.BytesIO(model_bytes), map_location="cpu")

        # Convert dict to GraphSchema object if needed
        if isinstance(graph_dict, dict):
            graph_schema = GraphSchema(**graph_dict)
        else:
            graph_schema = graph_dict

        # Rebuild model from graph
        model = build_model(graph_schema)
        model.load_state_dict(state_dict)
        model.eval()

        # Move to GPU
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)

        # Convert input to tensor
        input_tensor_torch = torch.tensor(input_tensor, dtype=torch.float32, device=device)

        # Run inference
        with torch.no_grad():
            output = model(input_tensor_torch)

        # Convert to list
        output_list = output.cpu().numpy().tolist()
        output_shape = list(output.shape)

        inference_time_ms = (time.time() - start_time) * 1000

        result = {
            "request_id": request_id,
            "model_id": model_id,
            "output": output_list,
            "shape": output_shape,
            "inference_time_ms": inference_time_ms,
        }

        # Send result back via callback
        try:
            callback_url = f"{backend_url}/api/models/callback"
            requests.post(callback_url, json=result, timeout=30)
        except Exception as e:
            print(f"Failed to send callback: {e}")

        return result

    except Exception as e:
        error_result = {
            "request_id": request_id,
            "model_id": model_id,
            "error": str(e),
        }

        # Send error callback
        try:
            callback_url = f"{backend_url}/api/models/callback"
            requests.post(callback_url, json=error_result, timeout=30)
        except Exception as callback_error:
            print(f"Failed to send error callback: {callback_error}")

        raise


async def run_inference_runpod_flash(
    model_state_dict_b64: str,
    graph_json: dict,
    input_tensor: list[list[float]],
    model_id: str,
    backend_url: str,
):
    """Execute inference on RunPod Flash and return results.

    Args:
        model_state_dict_b64: Base64-encoded model state dict
        graph_json: Graph schema as dictionary
        input_tensor: Input tensor as 2D list
        model_id: Model ID (for reference)
        backend_url: Backend URL for callbacks

    Returns:
        InferenceResponse with model output
    """
    import uuid
    import time
    from models.schemas import InferenceResponse

    try:
        request_id = str(uuid.uuid4())[:16]

        logger.info(f"Starting RunPod inference for model {model_id}, request {request_id}")

        # Call the remote inference function
        result = await infer_model_flash(
            model_state_dict_b64=model_state_dict_b64,
            graph_dict=graph_json,
            input_tensor=input_tensor,
            request_id=request_id,
            model_id=model_id,
            backend_url=backend_url,
        )

        logger.info(f"RunPod inference completed for request {request_id}")

        if "error" in result:
            raise Exception(f"RunPod inference failed: {result['error']}")

        return InferenceResponse(
            output=result["output"],
            shape=result["shape"],
            inference_time_ms=result.get("inference_time_ms"),
            model_id=result.get("model_id"),
        )

    except Exception as e:
        logger.exception(f"RunPod Flash inference failed: {e}")
        raise
