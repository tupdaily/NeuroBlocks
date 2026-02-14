"use client";

// ---------------------------------------------------------------------------
// ShapeEdge — animated edge with tensor-shape label on the wire
// ---------------------------------------------------------------------------

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useShapes } from "./ShapeContext";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";

function ShapeEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  data,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { shapes } = useShapes();

  // Resolve the source node's output shape for the label.
  const sourceResult = shapes.get(source);
  const shapeLabel = getShapeLabel(sourceResult?.outputShape ?? null);

  // If this edge was flagged invalid during onConnect, `data.error` is set.
  const hasError = !!data?.error;
  const errorMsg = (data?.error as string) ?? "";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = hasError ? "#ef4444" : "#6366f1";

  return (
    <>
      {/* Animated dashed edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: 2,
          strokeDasharray: "6 3",
          animation: "flowDash 0.5s linear infinite",
        }}
      />

      {/* Shape label on the wire */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <div
            className={`
              px-2 py-0.5 rounded text-[10px] font-mono leading-tight
              border backdrop-blur-sm shadow-sm
              ${
                hasError
                  ? "bg-red-950/80 border-red-500/60 text-red-300"
                  : "bg-neural-surface/90 border-neural-border text-neural-accent-light"
              }
            `}
            title={hasError ? errorMsg : shapeLabel}
          >
            {hasError ? "⚠ error" : shapeLabel}
          </div>
        </div>
      </EdgeLabelRenderer>

      {/* Tooltip on hover for error details */}
      {hasError && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -130%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            <div
              className="
                hidden group-hover:block
                max-w-[240px] px-2 py-1 rounded text-[10px]
                bg-red-950 border border-red-500/40 text-red-200
                shadow-lg
              "
            >
              {errorMsg}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ShapeEdgeType = memo(ShapeEdgeComponent);

// Inject the keyframe animation via a global style tag (once).
if (typeof document !== "undefined") {
  const STYLE_ID = "neural-canvas-edge-anim";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes flowDash {
        to { stroke-dashoffset: -9; }
      }
    `;
    document.head.appendChild(style);
  }
}
