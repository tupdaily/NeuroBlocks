"use client";

// ---------------------------------------------------------------------------
// NeuralCanvas — main React Flow canvas component
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  BLOCK_REGISTRY,
  getBlockDefaults,
  type BlockType,
} from "@/neuralcanvas/lib/blockRegistry";
import { validateConnection } from "@/neuralcanvas/lib/shapeEngine";
import { ShapeProvider, useShapes } from "./ShapeContext";
import { ConnectionWire } from "./ConnectionWire";
import { BlockPalette, DRAG_BLOCK_TYPE } from "./BlockPalette";
import { useUndoRedo } from "@/neuralcanvas/hooks/useUndoRedo";
import {
  PeepInsideProvider,
  usePeepInsideContext,
} from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import { PeepInsideModal } from "@/neuralcanvas/components/peep-inside/PeepInsideModal";
import { TrainingPanel } from "@/neuralcanvas/components/training/TrainingPanel";
import {
  GradientFlowProvider,
  useGradientFlow,
} from "@/neuralcanvas/components/peep-inside/GradientFlowContext";
import { neuralCanvasToGraphSchema } from "@/lib/levelGraphAdapter";
import { createPlayground, updatePlayground, getPlayground } from "@/lib/supabase/playgrounds";
import {
  InputBlock,
  OutputBlock,
  LinearBlock,
  Conv2DBlock,
  LSTMBlock,
  AttentionBlock,
  LayerNormBlock,
  BatchNormBlock,
  ActivationBlock,
  DropoutBlock,
  FlattenBlock,
  EmbeddingBlock,
  SoftmaxBlock,
} from "@/neuralcanvas/components/blocks";

// ---------------------------------------------------------------------------
// Register one node type per block → specific block components
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  Input: InputBlock,
  Output: OutputBlock,
  Linear: LinearBlock,
  Conv2D: Conv2DBlock,
  LSTM: LSTMBlock,
  Attention: AttentionBlock,
  LayerNorm: LayerNormBlock,
  BatchNorm: BatchNormBlock,
  Activation: ActivationBlock,
  Dropout: DropoutBlock,
  Flatten: FlattenBlock,
  Embedding: EmbeddingBlock,
  Softmax: SoftmaxBlock,
};

const edgeTypes: EdgeTypes = {
  shape: ConnectionWire,
};

const defaultEdgeOptions = {
  type: "shape" as const,
  animated: false,
};

// ---------------------------------------------------------------------------
// Initial demo nodes so the canvas isn't empty on first load
// ---------------------------------------------------------------------------

const INITIAL_NODES: Node[] = [
  {
    id: "input-1",
    type: "Input",
    position: { x: 50, y: 200 },
    data: { params: {} },
  },
  {
    id: "flatten-1",
    type: "Flatten",
    position: { x: 300, y: 200 },
    data: { params: {} },
  },
  {
    id: "linear-1",
    type: "Linear",
    position: { x: 550, y: 200 },
    data: { params: { in_features: 784, out_features: 128 } },
  },
  {
    id: "activation-1",
    type: "Activation",
    position: { x: 800, y: 200 },
    data: { params: { activation: "relu" } },
  },
  {
    id: "linear-2",
    type: "Linear",
    position: { x: 1050, y: 200 },
    data: { params: { in_features: 128, out_features: 10 } },
  },
  {
    id: "output-1",
    type: "Output",
    position: { x: 1300, y: 200 },
    data: { params: {} },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: "e-1", source: "input-1", target: "flatten-1", type: "shape" },
  { id: "e-2", source: "flatten-1", target: "linear-1", type: "shape" },
  { id: "e-3", source: "linear-1", target: "activation-1", type: "shape" },
  { id: "e-4", source: "activation-1", target: "linear-2", type: "shape" },
  { id: "e-5", source: "linear-2", target: "output-1", type: "shape" },
];

// ---------------------------------------------------------------------------
// Inner canvas (needs to be inside ReactFlowProvider via ShapeProvider)
// ---------------------------------------------------------------------------

function CanvasInner({
  initialNodes,
  initialEdges,
  playgroundId,
  playgroundName,
}: {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  playgroundId?: string;
  playgroundName?: string;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes ?? INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? INITIAL_EDGES);
  const { shapes, recompute } = useShapes();
  const { takeSnapshot, undo, redo } = useUndoRedo();
  const [panOnDrag, setPanOnDrag] = useState(true);
  const [trainingPanelOpen, setTrainingPanelOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const idCounter = useRef(100);
  const reactFlowInstance = useReactFlow();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // ── Drag-and-drop from palette ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const blockType = e.dataTransfer.getData(DRAG_BLOCK_TYPE) as BlockType;
      if (!blockType || !BLOCK_REGISTRY[blockType]) return;

      // Convert screen coords → flow coords.
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      takeSnapshot(nodes, edges);

      const newNode: Node = {
        id: `${blockType}-${idCounter.current++}`,
        type: blockType,
        position,
        data: { params: getBlockDefaults(blockType) },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, nodes, edges, setNodes, takeSnapshot],
  );

  // ── Shape propagation on every change ──
  useEffect(() => {
    recompute(nodes, edges);
  }, [nodes, edges, recompute]);

  // ── Connection handler with validation ──
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      // Snapshot before mutation.
      takeSnapshot(nodes, edges);

      const sourceShape = shapes.get(sourceNode.id)?.outputShape ?? null;
      const validation = validateConnection(
        {
          id: sourceNode.id,
          type: sourceNode.type ?? "Input",
          data: { params: (sourceNode.data?.params ?? {}) as Record<string, string | number> },
        },
        {
          id: targetNode.id,
          type: targetNode.type ?? "Input",
          data: { params: (targetNode.data?.params ?? {}) as Record<string, string | number> },
        },
        sourceShape,
      );

      const newEdge: Edge = {
        ...connection,
        id: `e-${Date.now()}`,
        type: "shape",
        data: validation.valid ? {} : { error: validation.error },
      } as Edge;

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [nodes, edges, shapes, setEdges, takeSnapshot],
  );

  // ── Node deletion ──
  const deleteSelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    takeSnapshot(nodes, edges);
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  // ── Duplicate selected node ──
  const duplicateSelectedNode = useCallback(() => {
    const selected = nodes.find((n) => n.selected);
    if (!selected) return;
    takeSnapshot(nodes, edges);
    const newId = `${selected.type}-${idCounter.current++}`;
    const clone: Node = {
      ...structuredClone(selected),
      id: newId,
      position: {
        x: selected.position.x + 40,
        y: selected.position.y + 40,
      },
      selected: false,
    };
    setNodes((nds) => [...nds, clone]);
  }, [nodes, edges, setNodes, takeSnapshot]);

  // ── Save to Supabase ──
  const router = useRouter();
  const handleSave = useCallback(async () => {
    if (nodes.length === 0) return;
    setSaveStatus("saving");
    try {
      let metadata: { name?: string; created_at?: string } | undefined;
      const row = playgroundId ? await getPlayground(playgroundId) : null;
      if (row) {
        metadata = {
          name: row.name,
          created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at,
        };
      } else if (playgroundName) {
        metadata = { name: playgroundName };
      }
      const graph = neuralCanvasToGraphSchema(nodes, edges, metadata);
      if (playgroundId) {
        const ok = await updatePlayground(
          playgroundId,
          graph,
          row?.name ?? graph.metadata?.name
        );
        setSaveStatus(ok ? "saved" : "error");
        if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        const result = await createPlayground(graph);
        if (result) {
          setSaveStatus("saved");
          router.replace(`/playground/${result.id}`);
          setTimeout(() => setSaveStatus("idle"), 1500);
        } else {
          setSaveStatus("error");
        }
      }
    } catch {
      setSaveStatus("error");
    }
  }, [nodes, edges, playgroundId, playgroundName, router]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't capture when user is typing in an input.
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Delete / Backspace → remove selected
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedNodes();
        return;
      }

      // Ctrl+Z → undo, Ctrl+Shift+Z → redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          const snapshot = redo(nodes, edges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          }
        } else {
          const snapshot = undo(nodes, edges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          }
        }
        return;
      }

      // Ctrl+D → duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelectedNode();
        return;
      }

      // Space (hold) → temporary selection mode so you can box-select
      if (e.key === " " && e.type === "keydown") {
        e.preventDefault();
        setPanOnDrag(false);
      }
    };

    const keyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setPanOnDrag(true);
      }
    };

    document.addEventListener("keydown", handler);
    document.addEventListener("keyup", keyUp);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("keyup", keyUp);
    };
  }, [
    nodes,
    edges,
    setNodes,
    setEdges,
    deleteSelectedNodes,
    duplicateSelectedNode,
    undo,
    redo,
  ]);

  // ── Nodes change handler (snapshot before drag) ──
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Snapshot on drag start so undo restores pre-drag position.
      const hasDragStart = changes.some(
        (c) => c.type === "position" && c.dragging,
      );
      if (hasDragStart) {
        takeSnapshot(nodes, edges);
      }
      onNodesChange(changes);
    },
    [onNodesChange, nodes, edges, takeSnapshot],
  );

  // ── MiniMap node color ──
  const minimapNodeColor = useCallback((node: Node) => {
    const blockType = node.type as BlockType;
    return BLOCK_REGISTRY[blockType]?.color ?? "#6366f1";
  }, []);

  return (
    <div className="flex w-full h-full">
      {/* ── Block Palette ── */}
      <BlockPalette />

      {/* ── Canvas ── */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 h-full relative"
        style={{ cursor: panOnDrag ? "grab" : "default" }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        panOnDrag={panOnDrag}
        selectionOnDrag={!panOnDrag}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null} // We handle delete ourselves.
      >
        {/* Subtle dot grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1f293766"
        />
        <Controls
          className="!bg-neural-surface !border-neural-border !rounded-lg !shadow-xl [&>button]:!bg-neural-surface [&>button]:!border-neural-border [&>button]:!text-neutral-400 [&>button:hover]:!bg-neural-border"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(11, 15, 26, 0.85)"
          className="!bg-neural-surface !border-neural-border !rounded-lg !shadow-xl"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* ── Top-right toolbar ── */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <SaveButton
          onSave={handleSave}
          status={saveStatus}
          disabled={nodes.length === 0}
        />
        <TrainingToggle
          open={trainingPanelOpen}
          onToggle={() => setTrainingPanelOpen((o) => !o)}
        />
      </div>

      {/* ── Training panel (slide-out) ── */}
      <TrainingPanel
        open={trainingPanelOpen}
        onClose={() => setTrainingPanelOpen(false)}
        nodes={nodes}
        edges={edges}
      />

      {/* ── Bottom bar: keyboard hints + gradient flow toggle ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-full bg-neural-surface/80 border border-neural-border backdrop-blur text-[10px] font-mono select-none">
        <span className="text-neutral-500 pointer-events-none">⌫ Delete</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘Z Undo</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘⇧Z Redo</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">⌘D Duplicate</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">Drag background to pan</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <span className="text-neutral-500 pointer-events-none">Space: box select</span>
        <span className="text-neural-border pointer-events-none">|</span>
        <GradientFlowToggle nodeIds={nodes.map((n) => n.id)} />
      </div>
      </div>

      {/* ── Peep Inside Modal ── */}
      <PeepInsideOverlay />
    </div>
  );
}

// ── Save to Supabase button ──
function SaveButton({
  onSave,
  status,
  disabled,
}: {
  onSave: () => void;
  status: "idle" | "saving" | "saved" | "error";
  disabled: boolean;
}) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Save failed"
          : "Save";
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled || status === "saving"}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          status === "saved"
            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
            : status === "error"
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : disabled || status === "saving"
                ? "bg-neural-surface/50 border-neural-border text-neutral-600 cursor-not-allowed"
                : "bg-neural-surface/80 border-neural-border text-neutral-300 hover:text-white hover:border-neutral-500"
        }
      `}
      title={disabled ? "Add blocks to save" : "Save to Supabase"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      {label}
    </button>
  );
}

// ── Training panel toggle button ──
function TrainingToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          open
            ? "bg-neural-accent/20 border-neural-accent/50 text-neural-accent-light shadow-[0_0_20px_rgba(139,92,246,0.15)]"
            : "bg-neural-surface/80 border-neural-border text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
        }
      `}
      title={open ? "Close training panel" : "Open training panel"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
      Train
    </button>
  );
}

// ── Gradient flow toggle button ──
function GradientFlowToggle({ nodeIds }: { nodeIds: string[] }) {
  const { enabled, setEnabled, seedDemo, gradients } = useGradientFlow();

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    // Seed demo data if no real gradient data exists yet.
    if (next && gradients.size === 0 && nodeIds.length > 0) {
      seedDemo(nodeIds);
    }
  }, [enabled, setEnabled, seedDemo, gradients.size, nodeIds]);

  return (
    <button
      onClick={handleToggle}
      className={`
        flex items-center gap-2 px-2.5 py-1 rounded-full
        border backdrop-blur text-[10px] font-mono font-semibold
        transition-all duration-200 select-none
        ${
          enabled
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            : "bg-neural-surface/80 border-neural-border text-neutral-500 hover:text-neutral-300 hover:border-neutral-600"
        }
      `}
      title={enabled ? "Hide gradient flow overlay" : "Show gradient flow overlay on canvas"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
      {enabled ? "Gradient Flow ON" : "Show Gradient Flow"}
    </button>
  );
}

// ── Renders the modal when a block is being peeped ──
function PeepInsideOverlay() {
  const { target, close } = usePeepInsideContext();
  if (!target) return null;
  return (
    <PeepInsideModal
      blockId={target.blockId}
      blockType={target.blockType}
      anchorX={target.anchorX}
      anchorY={target.anchorY}
      activationType={target.activationType}
      onClose={close}
    />
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper (provides ShapeContext)
// ---------------------------------------------------------------------------

export interface NeuralCanvasProps {
  /** When provided (e.g. from a challenge level), the canvas starts with this graph instead of the default demo. */
  initialNodes?: Node[];
  initialEdges?: Edge[];
  /** When provided, Save updates this playground in Supabase; otherwise Save creates a new one. */
  playgroundId?: string;
  /** Display name for the playground (used when saving). */
  playgroundName?: string;
}

export default function NeuralCanvas({
  initialNodes,
  initialEdges,
  playgroundId,
  playgroundName,
}: NeuralCanvasProps = {}) {
  return (
    <ReactFlowProvider>
      <ShapeProvider>
        <PeepInsideProvider>
          <GradientFlowProvider>
            <div className="w-full h-full min-h-0 bg-neural-bg">
              <CanvasInner
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                playgroundId={playgroundId}
                playgroundName={playgroundName}
              />
            </div>
          </GradientFlowProvider>
        </PeepInsideProvider>
      </ShapeProvider>
    </ReactFlowProvider>
  );
}
