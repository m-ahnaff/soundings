"use client";

import { useEffect, useState, type ReactNode } from "react";
import { absoluteDate, CATEGORY_LABEL, relativeTime, STATUS_LABEL } from "@/lib/format";
import type { Category, Status } from "@/lib/types";

const LOZENGE: Record<Status, string> = {
  under_review: "bg-[var(--lz-grey-bg)] text-[var(--lz-grey-fg)]",
  planned: "bg-[var(--lz-blue-bg)] text-[var(--lz-blue-fg)]",
  in_progress: "bg-[var(--lz-blue-bg)] text-[var(--lz-blue-fg)]",
  done: "bg-[var(--lz-green-bg)] text-[var(--lz-green-fg)]",
  declined: "bg-[var(--lz-red-bg)] text-[var(--lz-red-fg)]",
  merged: "bg-[var(--lz-grey-bg)] text-[var(--lz-grey-fg)]",
};

export function Lozenge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      className={`inline-flex h-[18px] max-w-full shrink-0 items-center rounded-[3px] px-1 text-[11px] leading-none font-bold tracking-[0.01em] whitespace-nowrap uppercase ${LOZENGE[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const TYPE_COLOR: Record<Category, string> = {
  feature: "var(--type-feature)",
  bug: "var(--type-bug)",
  improvement: "var(--type-improvement)",
};

/** Small coloured square with a glyph; shape differs per type so colour isn't the only cue. */
export function TypeIcon({
  type,
  size = 16,
  label = true,
}: {
  type: Category;
  size?: number;
  label?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={label ? "img" : undefined}
      aria-label={label ? CATEGORY_LABEL[type] : undefined}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <title>{CATEGORY_LABEL[type]}</title>
      <rect width="16" height="16" rx="3" fill={TYPE_COLOR[type]} />
      {type === "feature" && (
        <path d="M8 3.5v9M3.5 8h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      )}
      {type === "bug" && <circle cx="8" cy="8" r="3.25" fill="#fff" />}
      {type === "improvement" && (
        <path
          d="M8 12.5v-8M4.5 7.5 8 4l3.5 3.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

const AVATAR_COLORS = ["#4c6fa8", "#8a5a9e", "#2f7f73", "#a8673a", "#5b6b7d", "#9b4f5b", "#557a3a"];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, size = 24, title }: { name: string; size?: number; title?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      title={title ?? name}
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: AVATAR_COLORS[h % AVATAR_COLORS.length],
      }}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function TeamTag() {
  return (
    <span className="rounded-[3px] bg-[var(--lz-blue-bg)] px-1 text-[10px] leading-[16px] font-bold text-[var(--lz-blue-fg)] uppercase">
      Team
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line bg-sunken px-1 font-mono text-[11px] leading-none text-fg-subtle">
      {children}
    </kbd>
  );
}

/**
 * Relative timestamps depend on "now", which differs between server render and
 * hydration: render once, suppress the expected mismatch, refresh every minute.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={absoluteDate(iso)} className={className} suppressHydrationWarning>
      {relativeTime(iso, now)}
    </time>
  );
}
