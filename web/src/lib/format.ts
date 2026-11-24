import type { Category, Status } from "@/lib/types";

export const STATUS_LABEL: Record<Status, string> = {
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
  merged: "Merged",
};

export const STATUS_ORDER: Status[] = ["under_review", "planned", "in_progress", "done", "declined"];

export const CATEGORY_LABEL: Record<Category, string> = {
  feature: "Feature",
  bug: "Bug",
  improvement: "Improvement",
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "long" });

export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}

export function absoluteDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}

/** Short human key for a request, e.g. FB-117. */
export const issueKey = (n: number) => `FB-${n}`;
