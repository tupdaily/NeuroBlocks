"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { LiveTrainingState } from "./types";

interface LiveTrainingOverlayProps extends LiveTrainingState {
  totalEpochs?: number;
  /** When true, render inline in the right panel (no absolute positioning). */
  embedded?: boolean;
}

/** Live training metrics — overlay on canvas or embedded in the right panel. */
export function LiveTrainingOverlay({
  status,
  metrics,
  lastMessage,
  totalEpochs = 10,
  totalBatches,
  latestBatch,
  embedded = false,
}: LiveTrainingOverlayProps) {
  const latest = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const chartData = useMemo(
    () =>
      metrics.map((m) => ({
        epoch: m.epoch,
        train_loss: m.train_loss,
        val_loss: m.val_loss,
        train_acc: m.train_acc * 100,
        val_acc: m.val_acc * 100,
      })),
    [metrics]
  );

  const lossDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1] as [number, number];
    const losses = chartData.flatMap((d) => [d.train_loss, d.val_loss]);
    const min = Math.min(...losses);
    const max = Math.max(...losses);
    const padding = (max - min) * 0.05 || 0.1;
    return [Math.max(0, min - padding), max + padding] as [number, number];
  }, [chartData]);

  const accuracyDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 100];
    const accs = chartData.flatMap((d) => [d.train_acc, d.val_acc]);
    const min = Math.min(...accs);
    const max = Math.max(...accs);
    const padding = Math.max(5, (max - min) * 0.05);
    return [Math.max(0, min - padding), Math.min(100, max + padding)];
  }, [chartData]);

  if (status === "idle") return null;

  const isActive = status === "starting" || status === "running";
  const statusLabel =
    status === "starting"
      ? "Starting…"
      : status === "running"
        ? "Training…"
        : status === "completed"
          ? "Completed"
          : status === "stopped"
            ? "Stopped"
            : status === "error"
              ? "Error"
              : status;

  return (
    <div
      className={
        embedded
          ? "w-full rounded-xl border border-neural-border bg-neural-bg overflow-hidden"
          : "absolute top-4 left-4 z-20 w-72 rounded-xl border border-neural-border bg-neural-surface/95 backdrop-blur-md shadow-xl overflow-hidden"
      }
      style={
        embedded
          ? undefined
          : {
              boxShadow: isActive
                ? "0 0 24px rgba(139, 92, 246, 0.2)"
                : undefined,
            }
      }
    >
      {/* Header */}
      <div
        className={`px-3 py-2 border-b border-neural-border flex items-center justify-between ${
          isActive ? "bg-neural-accent/15" : "bg-white/[0.03]"
        }`}
      >
        <span className="text-[11px] font-mono font-semibold text-white">
          {statusLabel}
        </span>
        {(latestBatch || latest) && (
          <span className="text-[10px] font-mono text-neutral-500">
            {latestBatch
              ? `Epoch ${latestBatch.epoch} · batch ${latestBatch.batch}${typeof totalBatches === "number" ? ` / ${totalBatches}` : ""}`
              : latest
                ? `Epoch ${latest.epoch}${totalEpochs > 0 ? ` / ${totalEpochs}` : ""}`
                : null}
          </span>
        )}
      </div>

      {/* Live metrics */}
      <div className="p-3 space-y-3">
        {/* Batch progress (live during epoch) */}
        {latestBatch && (
          <div className="rounded-lg bg-white/[0.04] border border-neural-border px-3 py-2 space-y-1">
            <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
              Current batch
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-mono text-emerald-400">
                Loss {latestBatch.loss.toFixed(4)}
              </span>
              {typeof totalBatches === "number" && totalBatches > 0 && (
                <span className="text-[9px] font-mono text-neutral-500">
                  {Math.round((latestBatch.batch / totalBatches) * 100)}%
                </span>
              )}
            </div>
            {typeof totalBatches === "number" && (
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (latestBatch.batch / totalBatches) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {latest ? (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
              <div className="text-neutral-500">Train loss</div>
              <div className="text-right text-emerald-400">
                {latest.train_loss.toFixed(4)}
              </div>
              <div className="text-neutral-500">Val loss</div>
              <div className="text-right text-amber-400">
                {latest.val_loss.toFixed(4)}
              </div>
              <div className="text-neutral-500">Train acc</div>
              <div className="text-right text-emerald-400">
                {(latest.train_acc * 100).toFixed(2)}%
              </div>
              <div className="text-neutral-500">Val acc</div>
              <div className="text-right text-amber-400">
                {(latest.val_acc * 100).toFixed(2)}%
              </div>
            </div>

            {/* Loss & accuracy charts over epochs */}
            {chartData.length >= 1 && (
              <div className="space-y-3 pt-2 border-t border-neural-border">
                <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
                  Metrics over epochs
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-[9px] font-mono text-neutral-500 mb-1">
                      Loss
                    </div>
                    <div className="h-[72px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 4, right: 4, bottom: 0, left: 40 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.06)"
                          />
                          <XAxis
                            dataKey="epoch"
                            tick={{ fontSize: 8, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 8, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            tickFormatter={(v: number) => v.toFixed(2)}
                            domain={lossDomain}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "rgba(17, 24, 39, 0.95)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontFamily: "monospace",
                            }}
                            labelFormatter={(epoch) => `Epoch ${epoch}`}
                            formatter={(value: number, name: string) => [value.toFixed(4), name === "train_loss" ? "Train" : "Val"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="train_loss"
                            name="Train"
                            stroke="#34d399"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive
                            animationDuration={400}
                          />
                          <Line
                            type="monotone"
                            dataKey="val_loss"
                            name="Val"
                            stroke="#fbbf24"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive
                            animationDuration={400}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-neutral-500 mb-1">
                      Accuracy (%)
                    </div>
                    <div className="h-[72px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 4, right: 4, bottom: 0, left: 40 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.06)"
                          />
                          <XAxis
                            dataKey="epoch"
                            tick={{ fontSize: 8, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 8, fill: "#6b7280" }}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            tickFormatter={(v: number) => `${v}%`}
                            domain={accuracyDomain}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "rgba(17, 24, 39, 0.95)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontFamily: "monospace",
                            }}
                            labelFormatter={(epoch) => `Epoch ${epoch}`}
                            formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name === "train_acc" ? "Train" : "Val"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="train_acc"
                            name="Train"
                            stroke="#34d399"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive
                            animationDuration={400}
                          />
                          <Line
                            type="monotone"
                            dataKey="val_acc"
                            name="Val"
                            stroke="#fbbf24"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive
                            animationDuration={400}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[8px] font-mono text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-0.5 bg-emerald-400 rounded" />
                    Train
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-0.5 bg-amber-400 rounded" />
                    Val
                  </span>
                </div>
              </div>
            )}
          </>
        ) : status === "error" && lastMessage?.type === "error" ? (
          <div className="text-[10px] font-mono text-red-400/90 py-1">
            {(lastMessage.message as string) ?? "Training failed"}
          </div>
        ) : (
          <div className="text-[10px] font-mono text-neutral-500 py-1">
            {status === "starting" && !lastMessage
              ? "Connecting…"
              : status === "starting" && lastMessage?.type === "connected"
                ? "Building model & loading data…"
                : lastMessage?.type === "started"
                  ? `Device: ${(lastMessage.device as string) ?? "—"} · Waiting for first epoch…`
                  : "Waiting for first epoch…"}
          </div>
        )}
      </div>
    </div>
  );
}
