"""Debug script: load a graph JSON and print the compiled PyTorch model."""

import sys
import json
import torch
from models.schemas import GraphSchema
from compiler.validator import validate_graph, topological_sort
from compiler.shape_inference import infer_shapes
from compiler.model_builder import build_model, count_parameters


def debug_graph(path: str):
    with open(path) as f:
        data = json.load(f)

    graph = GraphSchema(**data)

    # 1. Validate
    print("=" * 60)
    print("VALIDATION")
    print("=" * 60)
    try:
        validate_graph(graph)
        print("  OK")
    except Exception as e:
        print(f"  FAILED: {e}")
        return

    # 2. Topological order
    topo = topological_sort(graph)
    nodes_by_id = {n.id: n for n in graph.nodes}
    print("\n" + "=" * 60)
    print("TOPOLOGICAL ORDER")
    print("=" * 60)
    for i, nid in enumerate(topo):
        node = nodes_by_id[nid]
        print(f"  {i}: [{node.type}] {nid}")

    # 3. Shape inference
    print("\n" + "=" * 60)
    print("SHAPE INFERENCE")
    print("=" * 60)
    input_nodes = [n for n in graph.nodes if n.type == "input"]
    input_shape = tuple(input_nodes[0].params.get("shape", [1, 28, 28]))
    shapes = infer_shapes(graph, input_shape)
    for nid in topo:
        node = nodes_by_id[nid]
        shape = shapes.get(nid, "?")
        print(f"  [{node.type}] {nid}  ->  {shape}")

    # 4. Build model
    print("\n" + "=" * 60)
    print("PYTORCH MODEL")
    print("=" * 60)
    model = build_model(graph, input_shape)
    print(model)

    # 5. Parameter count
    total = count_parameters(model)
    print(f"\nTotal trainable parameters: {total:,}")

    # 6. Test forward pass
    print("\n" + "=" * 60)
    print("TEST FORWARD PASS")
    print("=" * 60)
    batch_size = 2
    x = torch.randn(batch_size, *input_shape)
    print(f"  Input shape:  {list(x.shape)}")
    with torch.no_grad():
        y = model(x)
    print(f"  Output shape: {list(y.shape)}")
    print(f"  Output sample: {y[0].tolist()[:5]}{'...' if y.shape[-1] > 5 else ''}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "../model-graph.json"
    debug_graph(path)
