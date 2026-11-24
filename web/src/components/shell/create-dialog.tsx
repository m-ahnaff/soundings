"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { api, errorMessage, readDemoRole } from "@/lib/api-client";
import { BOARD_NAME, IS_DEMO } from "@/lib/env";
import { CATEGORY_LABEL } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Category, Post, PostList } from "@/lib/types";
import { Lozenge, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { EVT } from "@/components/shell/top-nav-client";
import { useToast } from "@/components/toaster";
import { btn, field, Modal, selectCls } from "@/components/ui";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "when",
  "that",
  "this",
  "from",
  "into",
  "have",
  "your",
  "should",
  "would",
  "could",
  "please",
]);

function keywords(title: string): string[] {
  return Array.from(
    new Set(
      title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

async function isSignedIn(): Promise<boolean> {
  if (IS_DEMO) return readDemoRole() !== "anon";
  const { data } = await getSupabaseBrowser().auth.getSession();
  return Boolean(data.session);
}

/** "Create request" modal, opened from the top bar, the `c` shortcut or empty states. */
export function CreateDialog() {
  const router = useRouter();
  const toast = useToast();
  const ids = { type: useId(), summary: useId(), desc: useId() };
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [type, setType] = useState<Category>("feature");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [another, setAnother] = useState(false);
  const [similar, setSimilar] = useState<Post[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Post | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const title = (e as CustomEvent<{ title?: string }>).detail?.title;
      if (title) setSummary(title.slice(0, 140));
      setError(null);
      setCreated(null);
      setOpen(true);
      setSignedIn(null);
      isSignedIn().then(setSignedIn, () => setSignedIn(false));
    };
    window.addEventListener(EVT.create, onOpen);
    // Deep link: /new?title=… redirects to /?create=1&title=…
    const url = new URL(window.location.href);
    if (url.searchParams.get("create") === "1") {
      const title = url.searchParams.get("title") ?? undefined;
      url.searchParams.delete("create");
      url.searchParams.delete("title");
      // Through the router (not history) so a later router.refresh() keeps the clean URL.
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
      onOpen(new CustomEvent(EVT.create, { detail: { title } }));
    }
    return () => window.removeEventListener(EVT.create, onOpen);
  }, [router]);

  useEffect(() => {
    const words = keywords(summary);
    if (!open || words.length === 0) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const pages = await Promise.all(
          words.map((w) =>
            api<PostList>(`/v1/posts?q=${encodeURIComponent(w)}&limit=5`, { signal: ctrl.signal }),
          ),
        );
        const byId = new Map<string, Post>();
        pages.flatMap((p) => p.items).forEach((p) => byId.set(p.id, p));
        setSimilar([...byId.values()].sort((a, b) => b.vote_count - a.vote_count).slice(0, 3));
      } catch {
        // aborted while typing
      }
    }, 300);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [summary, open]);

  const shownSimilar = keywords(summary).length > 0 ? similar : [];

  function close() {
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (summary.trim().length < 4) {
      setError("Summary must be at least 4 characters.");
      return;
    }
    setBusy(true);
    try {
      const post = await api<Post>("/v1/posts", {
        method: "POST",
        body: { title: summary, body: description, category: type },
      });
      toast.show(`${issueKey(post.number)} created. Your vote was added.`, {
        tone: "success",
        action: { label: `View ${issueKey(post.number)}`, href: `/p/${post.id}` },
      });
      setSummary("");
      setDescription("");
      setSimilar([]);
      setCreated(post); // shown inline: toasts sit behind the modal while it's open
      if (!another) setOpen(false);
      start(() => router.refresh());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create request"
      width={640}
      footer={
        signedIn ? (
          <>
            <label className="mr-auto flex items-center gap-2 text-[14px] text-fg-subtle">
              <input
                type="checkbox"
                checked={another}
                onChange={(e) => setAnother(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Create another
            </label>
            <button type="button" className={btn.subtle} onClick={close}>
              Cancel
            </button>
            <button type="submit" form="create-form" className={btn.primary} disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
          </>
        ) : undefined
      }
    >
      {signedIn === null && <div className="h-40" aria-busy="true" />}
      {signedIn === false && (
        <div className="rounded-[3px] bg-sunken px-4 py-4 text-[14px] text-fg-subtle">
          {IS_DEMO ? (
            <p>
              You&rsquo;re browsing signed out. Pick Member or Admin in the demo bar at the top, then try
              again.
            </p>
          ) : (
            <p>
              <Link href="/login" className="font-medium text-link hover:underline" onClick={close}>
                Log in
              </Link>{" "}
              to create a request. Browsing doesn&rsquo;t need an account.
            </p>
          )}
        </div>
      )}
      {signedIn && (
        <form id="create-form" onSubmit={submit} className="grid gap-4" noValidate>
          {created && another && (
            <p
              role="status"
              className="rounded-[3px] bg-[var(--lz-green-bg)] px-3 py-2 text-[14px] text-[var(--lz-green-fg)]"
            >
              Created{" "}
              <Link href={`/p/${created.id}`} onClick={close} className="font-semibold underline">
                {issueKey(created.number)}
              </Link>
              . Add the next one below.
            </p>
          )}
          <p className="text-[12px] text-fg-subtlest">
            Project: <span className="font-medium text-fg-subtle">{BOARD_NAME} feedback</span>. Required
            fields are marked with an asterisk <span className="text-danger">*</span>
          </p>
          <div className="grid gap-1">
            <label htmlFor={ids.type} className="text-[12px] font-semibold text-fg-subtle">
              Type <span className="text-danger">*</span>
            </label>
            <div className="flex items-center gap-2">
              <TypeIcon type={type} label={false} />
              <select
                id={ids.type}
                value={type}
                onChange={(e) => setType(e.target.value as Category)}
                className={`${selectCls} w-52`}
              >
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1">
            <label htmlFor={ids.summary} className="text-[12px] font-semibold text-fg-subtle">
              Summary <span className="text-danger">*</span>
            </label>
            <input
              id={ids.summary}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={140}
              autoFocus
              required
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={`${ids.summary}-hint`}
              className={`${field} h-9`}
            />
            <p id={`${ids.summary}-hint`} className="flex justify-between text-[12px] text-fg-subtlest">
              <span>{type === "bug" ? "What broke, in a few words." : "What should be possible?"}</span>
              <span className="tnum">{summary.length}/140</span>
            </p>
            <div aria-live="polite">
              {shownSimilar.length > 0 && (
                <div className="mt-1 rounded-[3px] border border-line bg-sunken px-3 py-2">
                  <p className="text-[12px] font-semibold text-fg-subtle">
                    Similar requests. A vote there counts too.
                  </p>
                  <ul className="mt-1.5 grid gap-1">
                    {shownSimilar.map((p) => (
                      <li key={p.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                        <TypeIcon type={p.category} size={14} />
                        <Link
                          href={`/p/${p.id}`}
                          onClick={close}
                          className="shrink-0 text-link hover:underline"
                        >
                          {issueKey(p.number)}
                        </Link>
                        <span className="min-w-0 truncate">{p.title}</span>
                        <Lozenge status={p.status} className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-1">
            <label htmlFor={ids.desc} className="text-[12px] font-semibold text-fg-subtle">
              Description
            </label>
            <textarea
              id={ids.desc}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={6}
              placeholder={
                type === "bug"
                  ? "Steps to reproduce, what you expected, what happened, device and app version."
                  : "What are you trying to do, and how do you work around it today?"
              }
              className={`${field} py-1.5 leading-5`}
            />
            <p className="text-[12px] text-fg-subtlest">
              Supports **bold**, *italic*, `code`, links and - lists.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-[3px] bg-[var(--lz-red-bg)] px-3 py-2 text-[14px] text-[var(--lz-red-fg)]"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
