"""Graph validation: cycle detection, connectivity, handle checks."""

from __future__ import annotations
from app.models.schemas import GraphSchema


class ValidationError(Exception):
    def __init__(self, message: str, node_id: str | None = None):
        self.message = message
        self.node_id = node_id
        super().__init__(message)


def validate_graph(graph: GraphSchema) -> None:
    """Validate the graph structure. Raises ValidationError on failure."""
    nodes_by_id = {n.id: n for n in graph.nodes}

    # Check for empty graph
    if not graph.nodes:
        raise ValidationError("Graph has no nodes")

    # Check for exactly one input and one output node
    input_nodes = [n for n in graph.nodes if n.type == "input"]
    output_nodes = [n for n in graph.nodes if n.type == "output"]

    if len(input_nodes) == 0:
        raise ValidationError("Graph must have an Input node")
    if len(input_nodes) > 1:
        raise ValidationError("Graph must have exactly one Input node")
    if len(output_nodes) == 0:
        raise ValidationError("Graph must have an Output node")
    if len(output_nodes) > 1:
        raise ValidationError("Graph must have exactly one Output node")

    input_node = input_nodes[0]
    output_node = output_nodes[0]

    # Build adjacency list
    adj: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    incoming: dict[str, list[str]] = {n.id: [] for n in graph.nodes}

    for edge in graph.edges:
        if edge.source not in nodes_by_id:
            raise ValidationError(f"Edge references unknown source node: {edge.source}")
        if edge.target not in nodes_by_id:
            raise ValidationError(f"Edge references unknown target node: {edge.target}")
        adj[edge.source].append(edge.target)
        incoming[edge.target].append(edge.source)

    # Cycle detection via DFS
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n.id: WHITE for n in graph.nodes}

    def dfs(node_id: str) -> bool:
        color[node_id] = GRAY
        for neighbor in adj[node_id]:
            if color[neighbor] == GRAY:
                return True  # cycle found
            if color[neighbor] == WHITE and dfs(neighbor):
                return True
        color[node_id] = BLACK
        return False

    for node in graph.nodes:
        if color[node.id] == WHITE:
            if dfs(node.id):
                raise ValidationError("Graph contains a cycle")

    # Connectivity: all nodes reachable from input
    reachable: set[str] = set()
    stack = [input_node.id]
    while stack:
        current = stack.pop()
        if current in reachable:
            continue
        reachable.add(current)
        stack.extend(adj[current])

    unreachable = set(nodes_by_id.keys()) - reachable
    if unreachable:
        labels = [nodes_by_id[nid].type for nid in unreachable]
        raise ValidationError(
            f"Nodes not reachable from Input: {', '.join(labels)}"
        )

    # Output must be reachable
    if output_node.id not in reachable:
        raise ValidationError("Output node is not reachable from Input")

    # Check that non-input nodes have incoming connections
    for node in graph.nodes:
        if node.type == "input":
            continue
        if node.type in ("add",):
            # Add needs exactly 2 inputs
            if len(incoming[node.id]) != 2:
                raise ValidationError(
                    f"Add node requires exactly 2 inputs, got {len(incoming[node.id])}",
                    node.id,
                )
        elif node.type in ("concat",):
            # Concat needs at least 2 inputs
            if len(incoming[node.id]) < 2:
                raise ValidationError(
                    f"Concat node requires at least 2 inputs, got {len(incoming[node.id])}",
                    node.id,
                )
        else:
            if len(incoming[node.id]) == 0:
                raise ValidationError(
                    f"{node.type} node has no input connection",
                    node.id,
                )


def topological_sort(graph: GraphSchema) -> list[str]:
    """Return node IDs in topological order."""
    adj: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    in_degree: dict[str, int] = {n.id: 0 for n in graph.nodes}

    for edge in graph.edges:
        adj[edge.source].append(edge.target)
        in_degree[edge.target] += 1

    # Kahn's algorithm
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    result: list[str] = []

    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return result


def get_input_nodes(graph: GraphSchema, node_id: str) -> list[str]:
    """Get the source node IDs connected to a given node's target handles."""
    return [e.source for e in graph.edges if e.target == node_id]


def get_input_node(graph: GraphSchema, node_id: str) -> str | None:
    """Get the single source node ID for a node (for single-input nodes)."""
    sources = get_input_nodes(graph, node_id)
    return sources[0] if sources else None


def get_input_by_handle(
    graph: GraphSchema, node_id: str, handle_id: str
) -> str | None:
    """Get the source node ID connected to a specific target handle."""
    for e in graph.edges:
        if e.target == node_id and e.targetHandle == handle_id:
            return e.source
    return None
