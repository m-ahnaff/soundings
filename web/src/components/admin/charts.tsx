"use client";

import { useState } from "react";
import { STATUS_LABEL } from "@/lib/format";
import type { Status } from "@/lib/types";
import { Lozenge } from "@/components/bits";

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Single series: one colour, no legend (the gadget title names it). Current week is partial, so it's outlined. */
export function WeeklyBars({ data }: { data: { week_start: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.ceil(max / 2), max];
  const W = 400;
  const H = 180;
  const pad = { l: 22, r: 4, t: 10, b: 24 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const barW = Math.min(28, slot - 12);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const last = data.length - 1;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Posts created per week, last 8 weeks"
      >
        <desc>{data.map((d) => `Week of ${weekLabel(d.week_start)}: ${d.count}`).join("; ")}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text
              x={pad.l - 6}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize="11"
              fill="var(--text-subtlest)"
            >
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + slot * i + (slot - barW) / 2;
          const h = Math.max(d.count > 0 ? 2 : 0, (d.count / max) * innerH);
          const top = pad.t + innerH - h;
          const r = Math.min(3, h / 2);
          const current = i === last;
          return (
            <g key={d.week_start}>
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + innerH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.t + innerH} Z`}
                  fill={current ? "var(--bg-selected)" : "var(--primary)"}
                  stroke={current ? "var(--primary)" : "none"}
                  strokeDasharray={current ? "3 2" : undefined}
                  opacity={hover === null || hover === i ? 1 : 0.5}
                />
              )}
              <text
                x={x + barW / 2}
                y={H - 7}
                textAnchor="middle"
                fontSize="11"
                fill={current ? "var(--text)" : "var(--text-subtlest)"}
              >
                {current ? "Now" : weekLabel(d.week_start)}
              </text>
              <rect
                x={pad.l + slot * i}
                y={pad.t}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-[3px] bg-overlay px-2 py-1 text-[12px] whitespace-nowrap shadow-overlay"
          style={{
            left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`,
            top: `${(Math.max(0, y(data[hover].count) - 30) / H) * 100}%`,
          }}
        >
          <span className="text-fg-subtle">
            {hover === last ? "This week so far" : `Week of ${weekLabel(data[hover].week_start)}`}
          </span>{" "}
          <span className="font-semibold tnum">{data[hover].count}</span>
        </div>
      )}
    </figure>
  );
}

const ORDER: Status[] = ["under_review", "planned", "in_progress", "done", "declined", "merged"];
const SEG: Record<Status, string> = {
  under_review: "var(--lz-grey-fg)",
  planned: "var(--type-improvement)",
  in_progress: "var(--lz-blue-fg)",
  done: "var(--type-feature)",
  declined: "var(--type-bug)",
  merged: "var(--border-control)",
};

/** One stacked bar + a labelled table (identity never by colour alone). */
export function StatusBreakdown({ breakdown }: { breakdown: Partial<Record<Status, number>> }) {
  const total = ORDER.reduce((s, k) => s + (breakdown[k] ?? 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-[3px]" aria-hidden="true">
        {ORDER.filter((k) => (breakdown[k] ?? 0) > 0).map((k) => (
          <div
            key={k}
            title={`${STATUS_LABEL[k]}: ${breakdown[k]}`}
            style={{ flexGrow: breakdown[k], background: SEG[k] }}
          />
        ))}
      </div>
      <table className="mt-4 w-full text-[14px]">
        <thead className="sr-only">
          <tr>
            <th>Status</th>
            <th>Requests</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {ORDER.map((k) => {
            const n = breakdown[k] ?? 0;
            return (
              <tr key={k} className="border-b border-line last:border-b-0">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-[2px]"
                      style={{ background: SEG[k] }}
                    />
                    <Lozenge status={k} />
                  </span>
                </td>
                <td className="py-1.5 text-right font-semibold tnum">{n}</td>
                <td className="w-14 py-1.5 text-right text-fg-subtlest tnum">
                  {Math.round((n / total) * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
