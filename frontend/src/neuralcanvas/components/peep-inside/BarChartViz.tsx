"use client";

// ---------------------------------------------------------------------------
// BarChartViz — gradient norms or 1-D activation distributions
// ---------------------------------------------------------------------------

import { memo } from "react";

interface BarItem {
  name: string;
  value: number;
}

interface BarChartVizProps {
  data: BarItem[];
  accentColor?: string;
  label?: string;
}

function BarChartVizComponent({
  data,
  accentColor = "#8b5cf6",
  label,
}: BarChartVizProps) {
  const maxVal = Math.max(...data.map((d) => Math.abs(d.value)), 1e-8);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-[10px] text-neutral-500 font-mono">{label}</span>
      )}
      <div className="space-y-1.5">
        {data.map((item) => {
          const pct = (Math.abs(item.value) / maxVal) * 100;
          return (
            <div key={item.name} className="flex items-center gap-2">
              <span className="text-[9px] text-neutral-400 font-mono w-16 truncate text-right shrink-0">
                {item.name}
              </span>
              <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: accentColor,
                    opacity: 0.7,
                    boxShadow: `0 0 8px ${accentColor}40`,
                  }}
                />
              </div>
              <span className="text-[9px] text-neutral-500 font-mono w-12 text-right shrink-0">
                {item.value.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const BarChartViz = memo(BarChartVizComponent);
