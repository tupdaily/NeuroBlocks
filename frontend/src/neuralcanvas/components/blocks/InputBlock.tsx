"use client";

// ---------------------------------------------------------------------------
// InputBlock — model input; dataset is chosen on this block.
// ---------------------------------------------------------------------------

import { memo, useCallback, useEffect, useState } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseBlock } from "./BaseBlock";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { CANVAS_UI_SCALE } from "@/neuralcanvas/lib/canvasConstants";
import { fetchDatasets } from "@/neuralcanvas/lib/trainingApi";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

const s = CANVAS_UI_SCALE;

function InputBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const { shapes } = useShapes();
  const { setNodes } = useReactFlow();
  const result = shapes.get(id);
  const outLabel = getShapeLabel(result?.outputShape ?? null);
  const params = data?.params ?? {};
  const datasetId = (params.dataset_id as string) ?? "";

  const [datasets, setDatasets] = useState<{ id: string; name: string; input_shape: number[] }[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDatasets()
      .then((list) => {
        if (!cancelled) setDatasets(list.map((d) => ({ id: d.id, name: d.name, input_shape: d.input_shape ?? [1, 28, 28] })));
      })
      .catch((e) => {
        if (!cancelled) setDatasetError(e instanceof Error ? e.message : "Failed to load datasets");
      });
    return () => { cancelled = true; };
  }, []);

  // Sync input_shape from selected dataset when we have dataset_id but no stored shape (e.g. existing graphs)
  useEffect(() => {
    if (!datasetId || !datasets.length || (params.input_shape as string)?.length) return;
    const match = datasets.find((d) => d.id === datasetId);
    if (!match?.input_shape?.length) return;
    const shapeStr = match.input_shape.join(",");
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const prevParams = (n.data?.params && typeof n.data.params === "object") ? (n.data.params as Record<string, number | string>) : {};
        return { ...n, data: { ...n.data, params: { ...prevParams, input_shape: shapeStr } } };
      }),
    );
  }, [datasetId, datasets, id, setNodes, params.input_shape]);

  const onDatasetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      const selected = datasets.find((d) => d.id === value);
      const inputShape = selected?.input_shape?.length ? selected.input_shape.join(",") : "";
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object")
            ? (n.data.params as Record<string, number | string>) : {};
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...prevParams, dataset_id: value, input_shape: inputShape },
            },
          };
        }),
      );
    },
    [id, setNodes, datasets],
  );

  return (
    <BaseBlock
      id={id}
      blockType="Input"
      params={params}
      selected={!!selected}
    >
      <div className="space-y-px mt-0.5 leading-none">
        <div className="flex items-center justify-between gap-1">
          <span className="text-neutral-600 font-mono shrink-0" style={{ fontSize: `${7 * s}px` }}>out</span>
          <span className="font-mono text-amber-400/80 truncate min-w-0" style={{ fontSize: `${7 * s}px` }}>{outLabel}</span>
        </div>
        <select
          value={datasetId}
          onChange={onDatasetChange}
          disabled={!!datasetError}
          className="nodrag nopan w-full mt-0.5 px-1 py-1 rounded bg-neural-bg border border-neural-border text-neutral-300 font-mono focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50 min-h-[18px]"
          style={{ fontSize: `${8 * s}px` }}
          title={datasetError ?? "Dataset"}
        >
          <option value="">Dataset…</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id} style={{ fontSize: `${8 * s}px` }}>{d.name}</option>
          ))}
        </select>
      </div>
    </BaseBlock>
  );
}

export const InputBlock = memo(InputBlockComponent);
