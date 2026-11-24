"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { IS_DEMO } from "@/lib/env";
import type { VoteResult } from "@/lib/types";
import { IconArrowUp } from "@/components/icons";
import { useToast } from "@/components/toaster";

interface Props {
  postId: string;
  title: string;
  count: number;
  voted: boolean;
  signedIn: boolean;
  closed?: boolean;
  /** "chip": compact count on cards/rows. "button": labelled button in the details panel. */
  variant?: "chip" | "button";
  onChange?: (r: { count: number; voted: boolean }) => void;
  /** Called once the server confirmed the vote (e.g. to refresh surrounding counts). */
  onSettled?: () => void;
}

/**
 * Optimistic toggle: flips immediately, the server's count replaces it, a
 * failure rolls back to the last confirmed state. Clicks are serialised.
 */
export function VoteButton({
  postId,
  title,
  count,
  voted,
  signedIn,
  closed,
  variant = "chip",
  onChange,
  onSettled,
}: Props) {
  const [state, setState] = useState({ count, voted, dir: "" as "" | "up" | "down" });
  const inflight = useRef<Promise<unknown> | null>(null);
  const confirmed = useRef({ count, voted });
  const toast = useToast();
  const pathname = usePathname();

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (closed) {
      toast.show("This request was merged. Vote on the one it was merged into.");
      return;
    }
    if (!signedIn) {
      if (IS_DEMO) toast.show("You're browsing signed out. Switch to Member in the demo bar to vote.");
      else
        toast.show("Log in to vote.", {
          action: { label: "Log in", href: `/login?next=${encodeURIComponent(pathname)}` },
        });
      return;
    }
    const next = !state.voted;
    const optimistic = state.count + (next ? 1 : -1);
    setState({ count: optimistic, voted: next, dir: next ? "up" : "down" });
    onChange?.({ count: optimistic, voted: next });
    toast.announce(
      `${next ? "Voted" : "Vote removed"}. ${optimistic} ${optimistic === 1 ? "vote" : "votes"}.`,
    );
    if (inflight.current) await inflight.current.catch(() => undefined);
    const req = api<VoteResult>(`/v1/posts/${postId}/vote`, { method: next ? "PUT" : "DELETE" });
    inflight.current = req;
    try {
      const res = await req;
      confirmed.current = { count: res.vote_count, voted: res.voted };
      setState((s) => (s.voted === res.voted ? { ...s, count: res.vote_count } : s));
      onChange?.({ count: res.vote_count, voted: res.voted });
      if (inflight.current === req) onSettled?.();
    } catch (err) {
      setState({ ...confirmed.current, dir: "" });
      onChange?.(confirmed.current);
      toast.error(errorMessage(err));
    } finally {
      if (inflight.current === req) inflight.current = null;
    }
  }

  const label = `Vote for ${title}, ${state.count} ${state.count === 1 ? "vote" : "votes"}`;
  const number = (
    <span className="relative inline-block overflow-hidden tnum">
      <span
        key={state.count}
        className={`block ${state.dir === "up" ? "tick-up" : state.dir === "down" ? "tick-down" : ""}`}
      >
        {state.count}
      </span>
    </span>
  );

  if (variant === "button") {
    return (
      <button
        type="button"
        data-vote-button
        onClick={toggle}
        aria-pressed={state.voted}
        aria-label={label}
        className={`inline-flex h-8 items-center gap-2 rounded-[3px] px-2.5 text-[14px] font-medium transition-colors ${
          state.voted ? "bg-selected text-primary" : "bg-hover text-fg-subtle hover:bg-pressed hover:text-fg"
        } ${closed ? "opacity-50" : ""}`}
      >
        <IconArrowUp size={15} strokeWidth={state.voted ? 2.2 : 1.6} />
        {state.voted ? "Voted" : "Vote"}
        <span className="rounded-[3px] bg-bg/60 px-1.5 text-[12px] leading-5 font-semibold">{number}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-vote-button
      onClick={toggle}
      aria-pressed={state.voted}
      aria-label={label}
      title={state.voted ? "You voted. Click to remove your vote" : "Vote"}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-1.5 text-[12px] font-semibold transition-colors ${
        state.voted ? "bg-selected text-primary" : "text-fg-subtle hover:bg-hover hover:text-fg"
      } ${closed ? "opacity-50" : ""}`}
    >
      <IconArrowUp size={13} strokeWidth={state.voted ? 2.4 : 1.8} />
      {number}
    </button>
  );
}
