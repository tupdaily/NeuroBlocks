"use client";

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

/** 1D pool: horizontal strip → shorter strip */
function MaxPool1DViz() {
  return (
    <svg width={160} height={44} viewBox="0 0 160 44">
      {/* Long strip (input) */}
      <rect x={20} y={14} width={56} height={16} rx={2} fill="none" stroke="#8B5CF6" strokeWidth="1" opacity="0.7" />
      <rect x={22} y={16} width={12} height={12} rx={1} fill="#8B5CF6" opacity={0.5} />
      <rect x={36} y={16} width={12} height={12} rx={1} fill="#8B5CF6" opacity={0.6} />
      <rect x={50} y={16} width={12} height={12} rx={1} fill="#8B5CF6" opacity={0.7} />
      <rect x={64} y={16} width={12} height={12} rx={1} fill="#8B5CF6" opacity={0.5} />
      {/* Arrow */}
      <line x1={80} y1={22} x2={96} y2={22} stroke="#8B5CF6" strokeWidth="1.5" opacity={0.85} />
      <polygon points="94,19 100,22 94,25" fill="#8B5CF6" opacity={0.85} />
      {/* Shorter strip (output) */}
      <rect x={104} y={16} width={40} height={12} rx={2} fill="#8B5CF6" opacity={0.6} stroke="#8B5CF6" strokeWidth="1" />
      <text x={124} y={40} textAnchor="middle" fontSize="8" fill="#8B5CF6" opacity={0.85}>
        MaxPool1D
      </text>
    </svg>
  );
}

function MaxPool1DBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  return (
    <BaseBlock id={id} blockType="MaxPool1D" params={data?.params ?? {}} selected={!!selected} data={data}>
      <MaxPool1DViz />
    </BaseBlock>
  );
}

export const MaxPool1DBlock = memo(MaxPool1DBlockComponent);
