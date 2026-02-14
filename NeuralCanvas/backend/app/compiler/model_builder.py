"""Dynamic PyTorch model construction from a visual graph."""

from __future__ import annotations
import math
import torch
import torch.nn as nn
from app.models.schemas import GraphSchema
from app.compiler.validator import (
    topological_sort,
    get_input_node,
    get_input_nodes,
)
from app.compiler.shape_inference import infer_shapes


class DynamicModel(nn.Module):
    """A PyTorch model constructed dynamically from a visual graph."""

    def __init__(self, graph: GraphSchema, shapes: dict[str, list[int]]):
        super().__init__()
        self.graph = graph
        self.nodes_by_id = {n.id: n for n in graph.nodes}
        self.topo_order = topological_sort(graph)
        self.shapes = shapes

        self.layers = nn.ModuleDict()
        for node_id in self.topo_order:
            node = self.nodes_by_id[node_id]
            layer = self._build_layer(node, shapes)
            if layer is not None:
                self.layers[node_id] = layer

    def _build_layer(
        self, node, shapes: dict[str, list[int]]
    ) -> nn.Module | None:
        p = node.params
        src = get_input_node(self.graph, node.id)
        in_shape = shapes.get(src) if src else None

        match node.type:
            case "input" | "output" | "add" | "concat":
                return None

            case "linear":
                in_features = (
                    math.prod(in_shape) if in_shape and len(in_shape) > 1 else (in_shape[0] if in_shape else 128)
                )
                return nn.Linear(
                    in_features,
                    int(p.get("out_features", 128)),
                    bias=bool(p.get("bias", True)),
                )

            case "conv2d":
                in_channels = in_shape[0] if in_shape else 1
                return nn.Conv2d(
                    in_channels,
                    int(p.get("out_channels", 32)),
                    kernel_size=int(p.get("kernel_size", 3)),
                    stride=int(p.get("stride", 1)),
                    padding=int(p.get("padding", 0)),
                )

            case "batchnorm":
                if in_shape and len(in_shape) >= 2:
                    return nn.BatchNorm2d(in_shape[0])
                elif in_shape:
                    return nn.BatchNorm1d(in_shape[0])
                return nn.Identity()

            case "layernorm":
                if in_shape:
                    return nn.LayerNorm(in_shape)
                return nn.Identity()

            case "dropout":
                return nn.Dropout(p=float(p.get("p", 0.5)))

            case "relu":
                return nn.ReLU()
            case "gelu":
                return nn.GELU()
            case "sigmoid":
                return nn.Sigmoid()
            case "tanh":
                return nn.Tanh()

            case "maxpool2d":
                return nn.MaxPool2d(
                    kernel_size=int(p.get("kernel_size", 2)),
                    stride=int(p.get("stride", 2)),
                )

            case "adaptiveavgpool2d":
                out_size = p.get("output_size", [1, 1])
                return nn.AdaptiveAvgPool2d(
                    (int(out_size[0]), int(out_size[1]))
                )

            case "flatten":
                return nn.Flatten(start_dim=1)

            case _:
                return nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        outputs: dict[str, torch.Tensor] = {}

        for node_id in self.topo_order:
            node = self.nodes_by_id[node_id]

            if node.type == "input":
                outputs[node_id] = x
                continue

            if node.type == "output":
                src = get_input_node(self.graph, node_id)
                if src:
                    return outputs[src]
                raise RuntimeError("Output node has no input")

            if node.type == "add":
                srcs = get_input_nodes(self.graph, node_id)
                outputs[node_id] = outputs[srcs[0]] + outputs[srcs[1]]
                continue

            if node.type == "concat":
                srcs = get_input_nodes(self.graph, node_id)
                dim = int(node.params.get("dim", 1))
                outputs[node_id] = torch.cat(
                    [outputs[s] for s in srcs], dim=dim
                )
                continue

            # Standard single-input layer
            src = get_input_node(self.graph, node_id)
            if src is None:
                raise RuntimeError(f"Node {node_id} ({node.type}) has no input")

            inp = outputs[src]

            # Auto-flatten before linear layers if input is multi-dimensional
            if node.type == "linear" and inp.dim() > 2:
                inp = inp.flatten(1)

            outputs[node_id] = self.layers[node_id](inp)

        raise RuntimeError("Graph has no output node")


def build_model(graph: GraphSchema, input_shape: tuple[int, ...] | None = None) -> DynamicModel:
    """Build a PyTorch model from a graph schema."""
    shapes = infer_shapes(graph, input_shape)
    model = DynamicModel(graph, shapes)

    # Print compiled model summary to console
    print("\n" + "=" * 60)
    print("COMPILED MODEL")
    print("=" * 60)

    topo = topological_sort(graph)
    nodes_by_id = {n.id: n for n in graph.nodes}

    print("\nExecution order:")
    print(model)

    total = count_parameters(model)
    print(f"\nTotal trainable parameters: {total:,}")

    # Dry-run forward pass to verify
    if input_shape:
        try:
            x = torch.randn(1, *input_shape)
            with torch.no_grad():
                y = model(x)
            print(f"Forward pass OK: {list(x.shape)} -> {list(y.shape)}")
        except Exception as e:
            print(f"Forward pass FAILED: {e}")

    print("=" * 60 + "\n")

    return model


def count_parameters(model: nn.Module) -> int:
    """Count total trainable parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
