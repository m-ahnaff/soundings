"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Kbd } from "@/components/bits";
import { IconSearch, IconX } from "@/components/icons";
import { selectCls } from "@/components/ui";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import type { Category } from "@/lib/types";

const PendingContext = createContext(false);
export const usePending = () => useContext(PendingContext);

/** URL-backed filters: shareable, Back/Forward-able, and server-rendered. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("selectedIssue");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  return { params, update, pending };
}

export function FilterBar({
  showStatus,
  showSort,
  signedIn,
  children,
}: {
  showStatus: boolean;
  showSort: boolean;
  signedIn: boolean;
  children: ReactNode;
}) {
  const { params, update, pending } = useUrlFilters();
  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "top";
  const mine = params.get("mine") === "1";
  const q = params.get("q") ?? "";
  const active = Boolean(status || category || mine || q);

  return (
    <PendingContext value={pending}>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-8">
        <SearchBox initial={q} onSearch={(v) => update({ q: v })} />
        {showStatus && (
          <Labeled label="Status">
            <select value={status} onChange={(e) => update({ status: e.target.value })} className={selectCls}>
              <option value="">All statuses</option>
              <option value="open">Open (not done)</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <Labeled label="Type">
          <select
            value={category}
            onChange={(e) => update({ category: e.target.value })}
            className={selectCls}
          >
            <option value="">All types</option>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Labeled>
        {showSort && (
          <Labeled label="Sort">
            <select value={sort} onChange={(e) => update({ sort: e.target.value })} className={selectCls}>
              <option value="top">Most votes</option>
              <option value="trending">Trending (7 days)</option>
              <option value="new">Newest</option>
              <option value="updated">Recently updated</option>
            </select>
          </Labeled>
        )}
        {signedIn && (
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => update({ mine: mine ? "" : "1" })}
            className={`h-8 rounded-[3px] px-2.5 text-[14px] font-medium ${
              mine ? "bg-selected text-primary" : "text-fg-subtle hover:bg-hover hover:text-fg"
            }`}
          >
            Only my requests
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={() => update({ status: "", category: "", mine: "", q: "" })}
            className="h-8 rounded-[3px] px-2 text-[14px] font-medium text-fg-subtle hover:bg-hover hover:text-fg"
          >
            Clear filters
          </button>
        )}
        {pending && (
          <span className="text-[12px] text-fg-subtlest" role="status">
            Updating…
          </span>
        )}
      </div>
      <div aria-busy={pending} className={`transition-opacity duration-100 ${pending ? "opacity-60" : ""}`}>
        {children}
      </div>
    </PendingContext>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[14px]">
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Reflect URL changes (Back, Clear filters) but never clobber typing in progress.
  if (initial !== lastInitial && !focused) {
    setLastInitial(initial);
    setValue(initial);
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("focus") === "search") {
      input.current?.focus();
      url.searchParams.delete("focus");
      window.history.replaceState(null, "", url);
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function change(v: string) {
    setValue(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onSearch(v.trim());
    }, 250);
  }

  return (
    <div className="relative w-full sm:w-60">
      <IconSearch
        size={14}
        className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-subtlest"
      />
      <label htmlFor="list-search" className="sr-only">
        Search this view
      </label>
      <input
        ref={input}
        id="list-search"
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setLastInitial(initial);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (value) change("");
            else input.current?.blur();
          }
        }}
        placeholder="Search"
        autoComplete="off"
        className="h-8 w-full rounded-[3px] border border-control bg-bg pr-8 pl-7 text-[14px] placeholder:text-fg-subtlest hover:bg-sunken focus:border-focus [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute top-1/2 right-1.5 -translate-y-1/2">
        {value ? (
          <button
            type="button"
            onClick={() => change("")}
            aria-label="Clear search"
            className="rounded-[3px] p-0.5 text-fg-subtlest hover:text-fg"
          >
            <IconX size={14} />
          </button>
        ) : (
          <span className="hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        )}
      </span>
    </div>
  );
}
