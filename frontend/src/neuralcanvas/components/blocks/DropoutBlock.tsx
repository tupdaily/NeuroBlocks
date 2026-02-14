"use client";

// ---------------------------------------------------------------------------
// DropoutBlock — regularisation via random zeroing
// ---------------------------------------------------------------------------

import { memo } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

function DropoutBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const p = Number(data?.params?.p ?? 0.5);
  const keepPct = Math.round((1 - p) * 100);

  return (
    <BaseBlock
      id={id}
      blockType="Dropout"
      params={data?.params ?? {}}
      selected={!!selected}
    >
      {/* Visual: keep percentage bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${keepPct}%`,
              backgroundColor: "#8b5cf6",
              opacity: 0.7,
            }}
          />
        </div>
        <span className="text-[8px] text-neutral-500 font-mono">{keepPct}% keep</span>
      </div>
    </BaseBlock>
  );
}

export const DropoutBlock = memo(DropoutBlockComponent);
