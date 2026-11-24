export type SP = Record<string, string | string[] | undefined>;

const SORTS = new Set(["top", "new", "trending", "updated"]);
const STATUSES = new Set(["open", "under_review", "planned", "in_progress", "done", "declined"]);
const CATEGORIES = new Set(["feature", "bug", "improvement"]);

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * Whitelist URL params into API params, so a mangled URL degrades to defaults.
 * Returns both the API query and the "view" query (what links should carry).
 */
export function parseFilters(sp: SP, opts: { allowStatus: boolean }) {
  const view = new URLSearchParams();
  const sort = one(sp.sort);
  const status = one(sp.status);
  const category = one(sp.category);
  const q = one(sp.q).trim().slice(0, 100);
  const mine = one(sp.mine) === "1";
  if (SORTS.has(sort)) view.set("sort", sort);
  if (opts.allowStatus && STATUSES.has(status)) view.set("status", status);
  if (CATEGORIES.has(category)) view.set("category", category);
  if (q) view.set("q", q);
  if (mine) view.set("mine", "1");
  const pageNum = Math.max(1, Math.min(400, parseInt(one(sp.page) || "1", 10) || 1));
  return {
    view,
    sort: (view.get("sort") ?? "top") as "top" | "new" | "trending" | "updated",
    mine,
    page: pageNum,
  };
}

export function apiQuery(view: URLSearchParams, extra: Record<string, string>): string {
  const qs = new URLSearchParams(view);
  if (qs.get("mine") === "1") qs.set("mine", "true");
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  return qs.toString();
}
