"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { expireRoadmap } from "@/lib/actions";
import { api, errorMessage } from "@/lib/api-client";
import { IS_DEMO } from "@/lib/env";
import { absoluteDate, CATEGORY_LABEL, STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import { MarkdownLite } from "@/lib/markdown";
import type {
  ActivityItem,
  Category,
  Comment,
  Me,
  Post,
  PostEvent,
  PostList,
  SettableStatus,
} from "@/lib/types";
import { Avatar, Lozenge, RelativeTime, TeamTag, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { IconExternal, IconMerge, IconMore, IconPin, IconX } from "@/components/icons";
import { useToast } from "@/components/toaster";
import { btn, ConfirmDialog, field, Modal, selectCls } from "@/components/ui";
import { VoteButton } from "@/components/vote-button";

interface Props {
  post: Post;
  activity: ActivityItem[];
  me: Me | null;
  signedIn: boolean;
  mode: "page" | "panel";
  onClose?: () => void;
  /** Called after any mutation so the caller can refetch. */
  onChanged: () => void;
  /** Called after delete/merge, when this request is gone from the board. */
  onGone?: (nextHref: string) => void;
}

export function IssueView({ post, activity, me, signedIn, mode, onClose, onChanged, onGone }: Props) {
  const toast = useToast();
  const isAdmin = me?.role === "admin";
  const canDelete = post.can_edit || isAdmin;
  const closed = post.status === "merged";
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [merging, setMerging] = useState(false);
  const [busy, setBusy] = useState(false);
  const Title = mode === "page" ? "h1" : "h2";

  async function removePost() {
    setBusy(true);
    try {
      await api(`/v1/posts/${post.id}`, { method: "DELETE" });
      await expireRoadmap();
      toast.show(`${issueKey(post.number)} deleted.`);
      setConfirmDelete(false);
      onGone?.("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  async function togglePin() {
    try {
      await api(`/v1/admin/posts/${post.id}`, { method: "PATCH", body: { pinned: !post.pinned } });
      await expireRoadmap();
      toast.show(post.pinned ? "Unpinned." : "Pinned to the top of lists.");
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="@container">
      {/* Key row */}
      <div className="flex items-center gap-2 text-[14px]">
        <TypeIcon type={post.category} />
        <Link href={`/p/${post.id}`} className="font-medium text-fg-subtlest hover:text-link hover:underline">
          {issueKey(post.number)}
        </Link>
        {post.pinned && (
          <span
            className="inline-flex items-center gap-1 text-[12px] text-fg-subtlest"
            title="Pinned by the team"
          >
            <IconPin size={13} /> Pinned
          </span>
        )}
        {mode === "panel" && (
          <div className="ml-auto flex items-center gap-0.5">
            <Link
              href={`/p/${post.id}`}
              className={`${btn.subtle} w-8 px-0`}
              aria-label="Open full page"
              title="Open full page"
            >
              <IconExternal />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className={`${btn.subtle} w-8 px-0`}
              aria-label="Close details"
              title="Close (Esc)"
            >
              <IconX />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <EditForm
          post={post}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.show("Changes saved.");
            onChanged();
          }}
        />
      ) : (
        <Title
          id={`issue-title-${post.id}`}
          className={`mt-2 font-medium tracking-[-0.01em] text-fg ${mode === "page" ? "text-[24px] leading-7" : "text-[20px] leading-6"}`}
        >
          {post.title}
        </Title>
      )}

      {/* Action bar */}
      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <VoteButton
            key={`${post.id}:${post.vote_count}:${post.has_voted}`}
            postId={post.id}
            title={post.title}
            count={post.vote_count}
            voted={post.has_voted}
            signedIn={signedIn}
            closed={closed}
            variant="button"
            onSettled={onChanged}
          />
          {post.can_edit && (
            <button type="button" className={btn.default} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {(isAdmin || canDelete) && !closed && (
            <MoreMenu
              items={[
                ...(isAdmin
                  ? [
                      {
                        label: post.pinned ? "Unpin" : "Pin to top",
                        icon: <IconPin size={14} />,
                        onSelect: togglePin,
                      },
                    ]
                  : []),
                ...(isAdmin
                  ? [
                      {
                        label: "Merge into…",
                        icon: <IconMerge size={14} />,
                        onSelect: () => setMerging(true),
                      },
                    ]
                  : []),
                ...(canDelete
                  ? [{ label: "Delete", danger: true, onSelect: () => setConfirmDelete(true) }]
                  : []),
              ]}
            />
          )}
          {closed && canDelete && (
            <button type="button" className={btn.subtle} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}

      {closed && post.merged_into && (
        <div className="mt-4 flex items-start gap-2.5 rounded-[3px] bg-[var(--lz-blue-bg)] px-3 py-2.5 text-[14px] text-[var(--lz-blue-fg)]">
          <IconMerge className="mt-0.5 shrink-0" />
          <p>
            This request was merged into{" "}
            <Link href={`/p/${post.merged_into.id}`} className="font-semibold underline">
              {issueKey(post.merged_into.number)} {post.merged_into.title}
            </Link>
            . Its votes moved there; follow that request for updates.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-x-8 gap-y-6 @2xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {!editing && (
            <section aria-labelledby={`desc-${post.id}`}>
              <h3 id={`desc-${post.id}`} className="mb-1.5 text-[14px] font-semibold">
                Description
              </h3>
              {post.body ? (
                <MarkdownLite text={post.body} className="text-[14px] leading-5 text-fg" />
              ) : (
                <p className="text-[14px] text-fg-subtlest">No description provided.</p>
              )}
            </section>
          )}
          <ActivityTabs
            postId={post.id}
            items={activity}
            me={me}
            signedIn={signedIn}
            closed={closed}
            onChanged={onChanged}
          />
        </div>
        <DetailsPanel
          key={`${post.status}:${post.updated_at}`}
          post={post}
          isAdmin={isAdmin}
          signedIn={signedIn}
          onChanged={onChanged}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${issueKey(post.number)}?`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={removePost}
        onClose={() => setConfirmDelete(false)}
      >
        &ldquo;{post.title}&rdquo; will be removed with its {post.vote_count}{" "}
        {post.vote_count === 1 ? "vote" : "votes"} and {post.comment_count}{" "}
        {post.comment_count === 1 ? "comment" : "comments"}. This can&rsquo;t be undone.
      </ConfirmDialog>
      {isAdmin && (
        <MergeDialog
          open={merging}
          post={post}
          onClose={() => setMerging(false)}
          onMerged={(target) => {
            setMerging(false);
            onGone?.(`/p/${target.id}`);
          }}
        />
      )}
    </div>
  );
}

function MoreMenu({
  items,
}: {
  items: { label: string; icon?: React.ReactNode; danger?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // close only the menu, not the panel behind it
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`${btn.subtle} w-8 bg-hover px-0`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        <IconMore />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="rise absolute top-9 left-0 z-40 min-w-44 rounded-[3px] bg-overlay py-1.5 shadow-overlay"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              onKeyDown={(e) => {
                const all = Array.from(
                  ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
                );
                const i = all.indexOf(e.currentTarget);
                if (e.key === "ArrowDown") all[(i + 1) % all.length]?.focus();
                if (e.key === "ArrowUp") all[(i - 1 + all.length) % all.length]?.focus();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[14px] hover:bg-hover focus:bg-hover ${
                it.danger ? "text-danger" : "text-fg"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsPanel({
  post,
  isAdmin,
  signedIn,
  onChanged,
}: {
  post: Post;
  isAdmin: boolean;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState(post.status);
  const [saving, setSaving] = useState(false);
  const statusId = useId();

  async function changeStatus(next: SettableStatus) {
    const prev = status;
    setStatus(next); // optimistic
    setSaving(true);
    try {
      await api(`/v1/admin/posts/${post.id}`, { method: "PATCH", body: { status: next } });
      await expireRoadmap();
      toast.show(`${issueKey(post.number)} moved to ${STATUS_LABEL[next]}.`, { tone: "success" });
      onChanged();
    } catch (err) {
      setStatus(prev);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, React.ReactNode][] = [
    [
      "Status",
      isAdmin && status !== "merged" ? (
        <div className="flex items-center gap-2">
          <label htmlFor={statusId} className="sr-only">
            Status
          </label>
          <select
            id={statusId}
            value={status}
            disabled={saving}
            onChange={(e) => changeStatus(e.target.value as SettableStatus)}
            className={`${selectCls} h-7 text-[13px] font-semibold uppercase`}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <Lozenge status={status} />
      ),
    ],
    [
      "Votes",
      <span key="v" className="font-semibold tnum">
        {post.vote_count}
        {post.has_voted && <span className="ml-1.5 font-normal text-fg-subtlest">(including yours)</span>}
      </span>,
    ],
    [
      "Reporter",
      <span key="r" className="flex items-center gap-2">
        <Avatar name={post.author?.display_name ?? "Former member"} size={24} />
        {post.author?.display_name ?? "Former member"}
        {post.author?.is_team && <TeamTag />}
      </span>,
    ],
    [
      "Type",
      <span key="t" className="flex items-center gap-2">
        <TypeIcon type={post.category} label={false} />
        {CATEGORY_LABEL[post.category]}
      </span>,
    ],
    [
      "Created",
      <span key="c" title={absoluteDate(post.created_at)}>
        {shortDate(post.created_at)}
      </span>,
    ],
    ["Updated", <RelativeTime key="u" iso={post.updated_at} />],
  ];
  if (post.merged_into) {
    rows.push([
      "Merged into",
      <Link key="m" href={`/p/${post.merged_into.id}`} className="text-link hover:underline">
        {issueKey(post.merged_into.number)}
      </Link>,
    ]);
  }

  return (
    <aside aria-label="Details" className="self-start rounded-[3px] border border-line">
      <h3 className="border-b border-line px-3 py-2 text-[14px] font-semibold">Details</h3>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-3 py-3 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-fg-subtle">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      {!signedIn && (
        <p className="border-t border-line px-3 py-2 text-[12px] text-fg-subtlest">
          {IS_DEMO ? "Switch to Member in the demo bar to vote and comment." : "Log in to vote and comment."}
        </p>
      )}
    </aside>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ActivityTabs({
  postId,
  items,
  me,
  signedIn,
  closed,
  onChanged,
}: {
  postId: string;
  items: ActivityItem[];
  me: Me | null;
  signedIn: boolean;
  closed: boolean;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const comments = items.filter((i): i is Comment => i.type === "comment");
  const events = items.filter((i): i is PostEvent => i.type === "event");
  const base = useId();
  const tabs = [
    { id: "comments" as const, label: "Comments", n: comments.length },
    { id: "history" as const, label: "History", n: events.length },
  ];

  return (
    <section className="mt-7" aria-label="Activity">
      <h3 className="mb-2 text-[14px] font-semibold">Activity</h3>
      <div role="tablist" aria-label="Activity" className="flex gap-1 border-b-2 border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}-tab`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const next = tab === "comments" ? "history" : "comments";
                setTab(next);
                document.getElementById(`${base}-${next}-tab`)?.focus();
              }
            }}
            className={`relative -mb-0.5 px-2 pb-1.5 text-[14px] font-medium ${
              tab === t.id ? "text-primary" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {t.label} <span className="text-fg-subtlest tnum">{t.n}</span>
            {tab === t.id && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${base}-${tab}`} aria-labelledby={`${base}-${tab}-tab`} className="pt-4">
        {tab === "comments" ? (
          <>
            {!closed && <Composer postId={postId} me={me} signedIn={signedIn} onPosted={onChanged} />}
            {comments.length === 0 ? (
              <p className="py-3 text-[14px] text-fg-subtlest">
                No comments yet. A concrete use case helps the team decide.
              </p>
            ) : (
              <ul className="grid gap-5">
                {[...comments].reverse().map((c) => (
                  <CommentItem key={c.id} comment={c} onDeleted={onChanged} />
                ))}
              </ul>
            )}
          </>
        ) : events.length === 0 ? (
          <p className="py-3 text-[14px] text-fg-subtlest">
            No status changes yet. This request is waiting for review.
          </p>
        ) : (
          <ul className="grid gap-4">
            {[...events].reverse().map((e) => (
              <EventItem key={e.id} event={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Composer({
  postId,
  me,
  signedIn,
  onPosted,
}: {
  postId: string;
  me: Me | null;
  signedIn: boolean;
  onPosted: () => void;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const inputId = useId();

  if (!signedIn) {
    return (
      <p className="mb-5 rounded-[3px] bg-sunken px-3 py-2.5 text-[14px] text-fg-subtle">
        {IS_DEMO ? (
          "Switch to Member in the demo bar to add a comment."
        ) : (
          <>
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="font-medium text-link hover:underline"
            >
              Log in
            </Link>{" "}
            to add a comment.
          </>
        )}
      </p>
    );
  }

  async function submit() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api(`/v1/posts/${postId}/comments`, { method: "POST", body: { body } });
      setBody("");
      setFocused(false);
      onPosted();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const expanded = focused || body.length > 0;
  return (
    <div className="mb-6 flex gap-3">
      <Avatar name={me?.display_name ?? "You"} size={32} />
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="sr-only">
          Add a comment
        </label>
        <textarea
          id={inputId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape" && !body) (e.target as HTMLTextAreaElement).blur();
          }}
          maxLength={2000}
          rows={expanded ? 4 : 1}
          placeholder="Add a comment…"
          className={`${field} resize-y py-1.5 leading-5`}
        />
        {expanded && (
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={btn.primary} disabled={sending || !body.trim()} onClick={submit}>
              {sending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={btn.subtle}
              onClick={() => {
                setBody("");
                setFocused(false);
              }}
            >
              Cancel
            </button>
            <span className="ml-auto hidden text-[12px] text-fg-subtlest sm:inline">
              Ctrl/⌘ + Enter to save
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ comment, onDeleted }: { comment: Comment; onDeleted: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = comment.author?.display_name ?? "Former member";

  async function remove() {
    setBusy(true);
    try {
      await api(`/v1/comments/${comment.id}`, { method: "DELETE" });
      toast.show("Comment deleted.");
      setConfirming(false);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3">
      <Avatar name={name} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[14px]">
          <span className="font-semibold">{name}</span>
          {comment.author?.is_team && <TeamTag />}
          <RelativeTime iso={comment.created_at} className="text-fg-subtlest" />
        </p>
        <MarkdownLite text={comment.body} className="mt-1 text-[14px] leading-5" />
        {comment.can_delete && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-1 text-[12px] font-medium text-fg-subtlest hover:text-fg hover:underline"
          >
            Delete
          </button>
        )}
      </div>
      {comment.can_delete && (
        <ConfirmDialog
          open={confirming}
          title="Delete this comment?"
          confirmLabel="Delete"
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        >
          It will be removed for everyone. This can&rsquo;t be undone.
        </ConfirmDialog>
      )}
    </li>
  );
}

function EventItem({ event }: { event: PostEvent }) {
  const actor = event.actor?.display_name ?? "The team";
  let body: React.ReactNode;
  if (event.kind === "status_changed" && event.to_status) {
    body = (
      <>
        changed the <span className="font-semibold">Status</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {event.from_status && <Lozenge status={event.from_status} />}
          <span aria-hidden="true" className="text-fg-subtlest">
            →
          </span>
          <span className="sr-only">to</span>
          <Lozenge status={event.to_status} />
        </span>
      </>
    );
  } else if (event.kind === "merged_from" || event.kind === "merged_into") {
    const ref = event.related ? (
      <Link href={`/p/${event.related.id}`} className="text-link hover:underline">
        {issueKey(event.related.number)} {event.related.title}
      </Link>
    ) : (
      "a deleted request"
    );
    body =
      event.kind === "merged_from" ? (
        <>merged {ref} into this request</>
      ) : (
        <>merged this request into {ref}</>
      );
  } else {
    body = <>{event.kind === "pinned" ? "pinned this request" : "unpinned this request"}</>;
  }
  return (
    <li className="flex gap-3">
      <Avatar name={actor} size={32} />
      <div className="min-w-0 flex-1 text-[14px]">
        <span className="font-semibold">{actor}</span> {body}
        <p className="mt-1 text-[12px] text-fg-subtlest">
          <RelativeTime iso={event.created_at} />
        </p>
      </div>
    </li>
  );
}

function EditForm({ post, onCancel, onSaved }: { post: Post; onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [category, setCategory] = useState<Category>(post.category);
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/v1/posts/${post.id}`, { method: "PATCH", body: { title, body, category } });
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 grid gap-3" aria-label="Edit request">
      <div className="grid gap-1">
        <label htmlFor={`${id}-t`} className="text-[12px] font-semibold text-fg-subtle">
          Summary
        </label>
        <input
          id={`${id}-t`}
          className={`${field} h-9`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={4}
          maxLength={140}
          required
          autoFocus
        />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-c`} className="text-[12px] font-semibold text-fg-subtle">
          Type
        </label>
        <select
          id={`${id}-c`}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className={`${selectCls} w-52`}
        >
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-d`} className="text-[12px] font-semibold text-fg-subtle">
          Description
        </label>
        <textarea
          id={`${id}-d`}
          className={`${field} min-h-32 py-1.5 leading-5`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={btn.primary} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={btn.subtle} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MergeDialog({
  open,
  post,
  onClose,
  onMerged,
}: {
  open: boolean;
  post: Post;
  onClose: () => void;
  onMerged: (target: Post) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const searchId = useId();

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ limit: "8", sort: "top" });
        if (q.trim()) qs.set("q", q.trim());
        const res = await api<PostList>(`/v1/posts?${qs}`, { signal: ctrl.signal });
        setResults(res.items.filter((p) => p.id !== post.id && p.status !== "merged"));
        setLoaded(true);
      } catch {
        // aborted
      }
    }, 180);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, open, post.id]);

  async function merge() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/v1/admin/posts/${post.id}/merge`, { method: "POST", body: { target_id: target.id } });
      await expireRoadmap();
      toast.show(`${issueKey(post.number)} merged into ${issueKey(target.number)}.`, { tone: "success" });
      onMerged(target);
    } catch (err) {
      // Toasts sit behind the modal's top layer, so show the error in the dialog.
      setMergeError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Merge ${issueKey(post.number)} into…`}
      width={560}
      footer={
        <>
          <button type="button" className={btn.subtle} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} disabled={!target || busy} onClick={merge}>
            {busy ? "Merging…" : target ? `Merge into ${issueKey(target.number)}` : "Merge"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-fg-subtle">
        This request closes and links to the one you pick. Its {post.vote_count}{" "}
        {post.vote_count === 1 ? "vote moves" : "votes move"} over; anyone who voted on both is counted once.
      </p>
      <label htmlFor={searchId} className="text-[12px] font-semibold text-fg-subtle">
        Find the original request
      </label>
      <input
        id={searchId}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by summary or FB number"
        className={`${field} mt-1 h-9`}
      />
      {mergeError && (
        <p
          role="alert"
          className="mt-2 rounded-[3px] bg-[var(--lz-red-bg)] px-3 py-2 text-[14px] text-[var(--lz-red-fg)]"
        >
          {mergeError}
        </p>
      )}
      <ul role="listbox" aria-label="Merge target" className="mt-2 grid max-h-64 gap-px overflow-y-auto">
        {!loaded && <li className="px-2 py-2 text-[14px] text-fg-subtlest">Loading…</li>}
        {loaded && results.length === 0 && (
          <li className="px-2 py-2 text-[14px] text-fg-subtlest">No matching requests.</li>
        )}
        {results.map((p) => (
          <li key={p.id} role="option" aria-selected={target?.id === p.id}>
            <button
              type="button"
              onClick={() => setTarget(p)}
              className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[14px] ${
                target?.id === p.id ? "bg-selected text-primary" : "hover:bg-hover"
              }`}
            >
              <TypeIcon type={p.category} size={14} />
              <span className="shrink-0 text-fg-subtlest">{issueKey(p.number)}</span>
              <span className="min-w-0 truncate">{p.title}</span>
              <Lozenge status={p.status} className="ml-auto" />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Loads a request by id and renders it in the right-hand panel over the board or list. */
export function IssuePanel({
  id,
  me,
  signedIn,
  onClose,
}: {
  id: string;
  me: Me | null;
  signedIn: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<{ post: Post; activity: ActivityItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api<Post>(`/v1/posts/${id}`, { signal: ctrl.signal }),
      api<{ items: ActivityItem[] }>(`/v1/posts/${id}/activity`, { signal: ctrl.signal }),
    ]).then(
      ([post, act]) => {
        setData({ post, activity: act.items });
        setError(null);
      },
      (err) => {
        if (!(err instanceof DOMException)) setError(errorMessage(err));
      },
    );
    return () => ctrl.abort();
  }, [id, version]);

  useEffect(() => {
    // Focus moves into the panel only when a different request opens, never on re-render.
    panelRef.current?.focus();
  }, [id]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.closest('[role="menu"]'))
      )
        return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Below md the panel covers the screen: make everything behind it inert (modal).
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !window.matchMedia("(max-width: 767.98px)").matches) return;
    const touched: HTMLElement[] = [];
    let node: HTMLElement | null = panel;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      for (const sib of Array.from(parent?.children ?? [])) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert && sib.tagName !== "SCRIPT") {
          sib.inert = true;
          touched.push(sib);
        }
      }
      node = parent;
    }
    return () => touched.forEach((el) => (el.inert = false));
  }, []);

  const current = data?.post.id === id ? data : null;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label="Request details"
      className="panel-in fixed inset-x-0 top-0 bottom-0 z-40 overflow-y-auto bg-bg px-5 py-4 shadow-overlay outline-none md:absolute md:inset-y-0 md:right-0 md:left-auto md:w-[min(720px,62%)] md:border-l md:border-line"
    >
      {error ? (
        <div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`${btn.subtle} w-8 px-0`}
              aria-label="Close details"
            >
              <IconX />
            </button>
          </div>
          <p className="text-[14px] text-fg-subtle">{error}</p>
        </div>
      ) : !current ? (
        <div aria-busy="true">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-3 h-6 w-4/5" />
          <div className="skeleton mt-4 h-8 w-40" />
          <div className="skeleton mt-6 h-24 w-full" />
          <span className="sr-only">Loading request…</span>
        </div>
      ) : (
        <IssueView
          post={current.post}
          activity={current.activity}
          me={me}
          signedIn={signedIn}
          mode="panel"
          onClose={onClose}
          onChanged={() => {
            setVersion((v) => v + 1);
            router.refresh();
          }}
          onGone={(href) => {
            onClose();
            router.refresh();
            if (href !== "/") router.push(href);
          }}
        />
      )}
    </div>
  );
}
