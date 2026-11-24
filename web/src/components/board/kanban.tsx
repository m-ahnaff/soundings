"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { expireRoadmap } from "@/lib/actions";
import { api, errorMessage } from "@/lib/api-client";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import type { Me, Post, SettableStatus } from "@/lib/types";
import { Avatar, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { IconComment, IconMore, IconPin } from "@/components/icons";
import { IssuePanel } from "@/components/issue/issue-view";
import { useListKeys } from "@/components/issue/use-list-keys";
import { isPlainClick, useSelectedIssue } from "@/components/issue/use-selected";
import { openCreate } from "@/components/shell/top-nav-client";
import { useToast } from "@/components/toaster";
import { VoteButton } from "@/components/vote-button";

export type Columns = Record<SettableStatus, { items: Post[]; total: number }>;

interface Props {
  columns: Columns;
  me: Me | null;
  signedIn: boolean;
  /** Current filters as a query string, for "view all in list" links. */
  query: string;
}

export function Kanban({ columns, me, signedIn, query }: Props) {
  const router = useRouter();
  const toast = useToast();
  const isAdmin = me?.role === "admin";
  const [cols, setCols] = useState(columns);
  const [source, setSource] = useState(columns);
  const [dragging, setDragging] = useState<{ id: string; from: SettableStatus } | null>(null);
  const [over, setOver] = useState<SettableStatus | null>(null);
  const { selected, select } = useSelectedIssue();
  const boardRef = useRef<HTMLDivElement>(null);
  useListKeys(boardRef, select, selected);

  // New server data (filters changed, refresh after a mutation) replaces local state.
  if (columns !== source) {
    setSource(columns);
    setCols(columns);
  }

  async function move(id: string, from: SettableStatus, to: SettableStatus) {
    if (from === to) return;
    const post = cols[from].items.find((p) => p.id === id);
    if (!post) return;
    const before = cols;
    setCols((c) => ({
      ...c,
      [from]: { items: c[from].items.filter((p) => p.id !== id), total: c[from].total - 1 },
      [to]: { items: [{ ...post, status: to }, ...c[to].items], total: c[to].total + 1 },
    }));
    toast.announce(`${issueKey(post.number)} moved to ${STATUS_LABEL[to]}.`);
    // The card remounts in its new column: keep keyboard focus on it.
    window.setTimeout(
      () => document.querySelector<HTMLElement>(`[data-item="${id}"] [data-item-link]`)?.focus(),
      0,
    );
    try {
      await api(`/v1/admin/posts/${id}`, { method: "PATCH", body: { status: to } });
      await expireRoadmap();
      router.refresh();
    } catch (err) {
      setCols(before);
      toast.error(errorMessage(err));
    }
  }

  const empty = STATUS_ORDER.every((s) => cols[s as SettableStatus].total === 0);

  return (
    <div>
      {empty ? (
        <div className="mx-4 rounded-[3px] border border-dashed border-line px-6 py-10 text-center sm:mx-8">
          <p className="text-[16px] font-medium">No requests match these filters</p>
          <p className="mt-1 text-[14px] text-fg-subtle">
            Try clearing a filter, or create the request yourself.
          </p>
          <button
            type="button"
            onClick={() => openCreate(new URLSearchParams(query).get("q") ?? undefined)}
            className="mt-4 h-8 rounded-[3px] bg-primary px-3 text-[14px] font-medium text-on-primary hover:bg-primary-hover"
          >
            Create request
          </button>
        </div>
      ) : (
        <div ref={boardRef} className="overflow-x-auto px-4 pb-6 sm:px-8">
          <div className="flex min-w-max gap-2" role="list" aria-label="Board columns">
            {(STATUS_ORDER as SettableStatus[]).map((status) => {
              const col = cols[status];
              const isOver = over === status && dragging?.from !== status;
              return (
                <section
                  key={status}
                  role="listitem"
                  aria-labelledby={`col-${status}`}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOver(status);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    if (dragging) move(dragging.id, dragging.from, status);
                    setDragging(null);
                  }}
                  className={`flex w-[272px] shrink-0 flex-col rounded-[3px] bg-sunken transition-colors ${
                    isOver ? "bg-selected outline-2 outline-dashed outline-primary/50" : ""
                  }`}
                >
                  <h2
                    id={`col-${status}`}
                    className="flex items-center gap-2 px-3 pt-3 pb-2 text-[12px] font-semibold tracking-[0.02em] text-fg-subtle uppercase"
                  >
                    {STATUS_LABEL[status]}
                    <span className="font-normal tnum" aria-label={`${col.total} requests`}>
                      {col.total}
                    </span>
                  </h2>
                  <ul className="flex min-h-24 flex-col gap-1.5 px-1.5 pb-1.5">
                    {col.items.map((post) => (
                      <Card
                        key={post.id}
                        post={post}
                        status={status}
                        selected={selected === post.id}
                        isAdmin={isAdmin}
                        signedIn={signedIn}
                        onOpen={() => select(post.id)}
                        onMove={(to) => move(post.id, status, to)}
                        onDragStart={() => setDragging({ id: post.id, from: status })}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        dragging={dragging?.id === post.id}
                      />
                    ))}
                    {col.items.length === 0 && (
                      <li className="px-2 py-3 text-[12px] text-fg-subtlest">
                        {isAdmin ? "Drag a card here" : "Nothing here yet"}
                      </li>
                    )}
                  </ul>
                  {col.total > col.items.length && (
                    <Link
                      href={`/requests?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), status }).toString()}`}
                      className="mx-1.5 mb-1.5 rounded-[3px] px-2 py-1.5 text-[12px] font-medium text-fg-subtle hover:bg-hover hover:text-fg"
                    >
                      +{col.total - col.items.length} more in the list view
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {selected && <IssuePanel id={selected} me={me} signedIn={signedIn} onClose={() => select(null)} />}
    </div>
  );
}

function Card({
  post,
  status,
  selected,
  isAdmin,
  signedIn,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  post: Post;
  status: SettableStatus;
  selected: boolean;
  isAdmin: boolean;
  signedIn: boolean;
  onOpen: () => void;
  onMove: (to: SettableStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const name = post.author?.display_name ?? "Former member";
  return (
    <li
      data-item={post.id}
      draggable={isAdmin}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`group relative rounded-[3px] border border-line bg-bg p-2.5 transition-colors hover:bg-hover ${
        selected ? "outline-2 outline-primary" : ""
      } ${dragging ? "opacity-40 shadow-raised" : ""} ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <a
        href={`/p/${post.id}`}
        data-item-link
        onClick={(e) => {
          if (isPlainClick(e)) {
            e.preventDefault();
            onOpen();
          }
        }}
        className="block text-[14px] leading-5 text-fg outline-offset-[3px] after:absolute after:inset-0 after:content-['']"
      >
        <span className={`line-clamp-3 ${isAdmin ? "pr-6" : ""}`}>{post.title}</span>
      </a>
      <div className="relative z-[1] mt-2.5 flex items-center gap-1.5 text-[12px] text-fg-subtle">
        <TypeIcon type={post.category} />
        <span className="font-medium">{issueKey(post.number)}</span>
        {post.pinned && (
          <span title="Pinned" className="text-fg-subtlest">
            <IconPin size={13} />
            <span className="sr-only">Pinned</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1" title={`${post.comment_count} comments`}>
          <IconComment size={13} />
          <span className="tnum">{post.comment_count}</span>
          <span className="sr-only">comments</span>
        </span>
        <VoteButton
          key={`${post.vote_count}:${post.has_voted}`}
          postId={post.id}
          title={post.title}
          count={post.vote_count}
          voted={post.has_voted}
          signedIn={signedIn}
        />
        <Avatar name={name} size={22} title={`Reporter: ${name}`} />
      </div>
      {isAdmin && <MoveMenu postKey={issueKey(post.number)} status={status} onMove={onMove} />}
    </li>
  );
}

/** Keyboard- and touch-friendly alternative to drag and drop. */
function MoveMenu({
  postKey,
  status,
  onMove,
}: {
  postKey: string;
  status: SettableStatus;
  onMove: (to: SettableStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div
      ref={ref}
      className="absolute top-1.5 right-1.5 z-[2] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Move ${postKey} to another status`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex size-6 items-center justify-center rounded-[3px] bg-bg text-fg-subtle hover:bg-pressed hover:text-fg"
      >
        <IconMore size={14} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Move to"
          className="rise absolute top-7 right-0 w-40 rounded-[3px] bg-overlay py-1 shadow-overlay"
        >
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.04em] text-fg-subtlest uppercase">
            Move to
          </p>
          {(STATUS_ORDER as SettableStatus[])
            .filter((s) => s !== status)
            .map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onMove(s);
                }}
                onKeyDown={(e) => {
                  const all = Array.from(
                    ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
                  );
                  const i = all.indexOf(e.currentTarget);
                  if (e.key === "ArrowDown") all[(i + 1) % all.length]?.focus();
                  if (e.key === "ArrowUp") all[(i - 1 + all.length) % all.length]?.focus();
                }}
                className="block w-full px-3 py-1.5 text-left text-[14px] hover:bg-hover focus:bg-hover"
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
