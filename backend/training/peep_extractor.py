"""Extract per-block inspection data (weights, gradients, filters) from a trained model."""

from __future__ import annotations
import logging
import torch
import torch.nn as nn
from typing import Any

logger = logging.getLogger(__name__)

# Maximum number of elements to send per tensor slice to avoid huge payloads.
MAX_TENSOR_ELEMENTS = 16384  # 128x128


def _tensor_to_slice(t: torch.Tensor, max_elements: int = MAX_TENSOR_ELEMENTS) -> dict[str, Any]:
    """Convert a tensor to a {data, shape} dict, downsampling if too large."""
    t = t.detach().cpu().float()

    # For weight matrices: take the first 2D slice if >2D
    if t.dim() > 2:
        # e.g. Conv2d weight is [out_ch, in_ch, H, W] — flatten to [out_ch, in_ch*H*W]
        t = t.view(t.shape[0], -1)

    # Downsample rows/cols if too many elements
    if t.numel() > max_elements:
        rows, cols = t.shape[0], t.shape[1] if t.dim() >= 2 else t.shape[0]
        # Target: keep aspect ratio, total <= max_elements
        import math
        scale = math.sqrt(max_elements / t.numel())
        new_rows = max(1, int(rows * scale))
        new_cols = max(1, int(cols * scale)) if t.dim() >= 2 else new_rows
        if t.dim() >= 2:
            t = t[:new_rows, :new_cols]
        else:
            t = t[:new_rows]

    data = t.flatten().tolist()
    shape = list(t.shape)
    return {"data": data, "shape": shape}


def _extract_conv_filters(layer: nn.Conv2d) -> dict[str, Any]:
    """Extract conv filter kernels as [out_channels, H, W] (first input channel)."""
    w = layer.weight.detach().cpu().float()  # [out_ch, in_ch, H, W]
    # Take first input channel slice for visualization
    filters = w[:, 0, :, :]  # [out_ch, H, W]
    # Limit to first 64 filters
    if filters.shape[0] > 64:
        filters = filters[:64]
    data = filters.flatten().tolist()
    shape = list(filters.shape)
    return {"data": data, "shape": shape}


def extract_peep_data(
    model: nn.Module,
    graph,
    sample_batch: torch.Tensor | None = None,
    device: torch.device | None = None,
) -> dict[str, dict[str, Any]]:
    """Extract per-block peep data from a trained model.

    Returns a dict mapping node_id -> PeepData-like dict with:
      - weights: {data, shape} or null
      - gradients: [{name, norm}] or null
      - filters: {data, shape} or null (Conv2D only)
      - activations: {data, shape} or null
      - step: 1 (indicates trained)

    If sample_batch is provided, runs a forward+backward pass to capture
    activations and gradients.
    """
    if device is None:
        device = next(model.parameters()).device

    nodes_by_id = {n.id: n for n in graph.nodes}
    peep: dict[str, dict[str, Any]] = {}

    # Collect intermediate activations via hooks if we have sample data
    activations: dict[str, torch.Tensor] = {}
    hooks = []

    if sample_batch is not None:
        def make_hook(node_id: str):
            def hook_fn(module, input, output):
                if isinstance(output, tuple):
                    output = output[0]
                activations[node_id] = output.detach()
            return hook_fn

        for node_id, layer in model.layers.items():
            h = layer.register_forward_hook(make_hook(node_id))
            hooks.append(h)

        # Run forward pass
        model.eval()
        try:
            with torch.no_grad():
                sample_batch = sample_batch.to(device)
                model(sample_batch)
        except Exception as e:
            logger.warning("Forward pass for peep data failed: %s", e)
        finally:
            for h in hooks:
                h.remove()

    # Run a forward+backward pass to capture gradients
    grad_norms: dict[str, list[dict[str, Any]]] = {}
    if sample_batch is not None:
        model.train()
        try:
            model.zero_grad()
            sample_batch = sample_batch.to(device)
            output = model(sample_batch)
            # Create a dummy loss (sum of outputs) to get gradients
            loss = output.sum()
            loss.backward()

            for node_id, layer in model.layers.items():
                params_list = []
                for pname, param in layer.named_parameters():
                    if param.grad is not None:
                        norm_val = param.grad.detach().float().norm().item()
                        params_list.append({"name": pname, "norm": round(norm_val, 8)})
                if params_list:
                    grad_norms[node_id] = params_list
        except Exception as e:
            logger.warning("Backward pass for peep data failed: %s", e)

    # Extract per-block data
    for node_id, layer in model.layers.items():
        node = nodes_by_id.get(node_id)
        if node is None:
            continue

        block_data: dict[str, Any] = {
            "blockId": node_id,
            "blockType": node.type,
            "step": 1,
            "weights": None,
            "activations": None,
            "gradients": None,
            "attentionMap": None,
            "filters": None,
            "timestamp": 0,
        }

        # Extract weights (first weight parameter)
        weight_param = None
        for pname, param in layer.named_parameters():
            if "weight" in pname:
                weight_param = param
                break
        if weight_param is None:
            # Fallback: use any parameter
            params_iter = list(layer.parameters())
            if params_iter:
                weight_param = params_iter[0]

        if weight_param is not None:
            try:
                block_data["weights"] = _tensor_to_slice(weight_param)
            except Exception as e:
                logger.warning("Failed to extract weights for %s: %s", node_id, e)

        # Extract conv filters
        if isinstance(layer, nn.Conv2d):
            try:
                block_data["filters"] = _extract_conv_filters(layer)
            except Exception as e:
                logger.warning("Failed to extract filters for %s: %s", node_id, e)

        # Extract activations
        if node_id in activations:
            try:
                act = activations[node_id]
                # Take first sample in batch
                if act.dim() > 1:
                    act = act[0]
                block_data["activations"] = _tensor_to_slice(act, max_elements=4096)
            except Exception as e:
                logger.warning("Failed to extract activations for %s: %s", node_id, e)

        # Extract gradients
        if node_id in grad_norms:
            block_data["gradients"] = grad_norms[node_id]

        peep[node_id] = block_data

    return peep
