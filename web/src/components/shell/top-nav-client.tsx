"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setDemoRole } from "@/lib/api-client";
import { IS_DEMO, type DemoRole } from "@/lib/env";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Me } from "@/lib/types";
import { Avatar, Kbd } from "@/components/bits";
import { IconHelp, IconMenu, IconMoon, IconPlus, IconSearch, IconSun } from "@/components/icons";
import { useDrawerOpen } from "@/components/shell/sidebar-client";
import { useToast } from "@/components/toaster";
import { btn } from "@/components/ui";

export const EVT = {
  create: "soundings:create",
  help: "soundings:help",
} as const;

export function openCreate(title?: string) {
  window.dispatchEvent(new CustomEvent(EVT.create, { detail: { title } }));
}

export function MenuButton() {
  const open = useDrawerOpen();
  return (
    <button
      type="button"
      data-drawer-toggle
      aria-expanded={open}
      aria-controls="project-nav"
      className={`${btn.subtle} w-8 px-0 md:hidden`}
      aria-label="Open navigation"
      onClick={() => document.documentElement.setAttribute("data-drawer", "open")}
    >
      <IconMenu />
    </button>
  );
}

export function CreateButton() {
  return (
    <button type="button" className={`${btn.primary} px-2.5 sm:px-3`} onClick={() => openCreate()}>
      <IconPlus size={14} strokeWidth={2} />
      <span className="hidden sm:inline">Create</span>
      <span className="sr-only sm:hidden">Create request</span>
    </button>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="relative hidden w-[min(28vw,280px)] lg:block"
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        router.push(v ? `/requests?q=${encodeURIComponent(v)}` : "/requests");
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <IconSearch
        size={14}
        className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-subtlest"
      />
      <label htmlFor="global-search" className="sr-only">
        Search requests
      </label>
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search requests"
        autoComplete="off"
        className="h-8 w-full rounded-[3px] border border-control bg-bg pr-8 pl-7 text-[14px] placeholder:text-fg-subtlest hover:bg-sunken focus:border-focus"
      />
      <span className="absolute top-1/2 right-1.5 -translate-y-1/2">
        <Kbd>/</Kbd>
      </span>
    </form>
  );
}

export function UtilityButtons() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage unavailable: applies to this page only
    }
  }
  return (
    <>
      <Link href="/requests" className={`${btn.subtle} w-8 px-0 lg:hidden`} aria-label="Search requests">
        <IconSearch />
      </Link>
      <button
        type="button"
        className={`${btn.subtle} w-8 px-0`}
        aria-label="Keyboard shortcuts and help"
        onClick={() => window.dispatchEvent(new CustomEvent(EVT.help))}
      >
        <IconHelp />
      </button>
      <button
        type="button"
        className={`${btn.subtle} w-8 px-0`}
        aria-label="Switch between light and dark theme"
        onClick={toggleTheme}
      >
        <IconMoon className="dark:hidden" />
        <IconSun className="hidden dark:block" />
      </button>
    </>
  );
}

const DEMO_LABEL: Record<DemoRole, string> = { anon: "Signed out", member: "Member", admin: "Admin" };

export function AccountMenu({ me, demoRole }: { me: Me | null; demoRole: DemoRole | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    setOpen(false);
    toast.show("You're logged out.");
    start(() => router.refresh());
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={me ? `Account: ${me.display_name}` : "Account"}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-full hover:bg-hover"
      >
        {me ? (
          <Avatar name={me.display_name} size={26} />
        ) : (
          <span className="flex size-[26px] items-center justify-center rounded-full bg-pressed text-fg-subtle">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="5.5" r="2.75" fill="currentColor" />
              <path d="M2.75 14c.6-3 2.7-4.5 5.25-4.5s4.65 1.5 5.25 4.5z" fill="currentColor" />
            </svg>
          </span>
        )}
      </button>
      {open && (
        <div
          role={IS_DEMO ? "dialog" : "menu"}
          aria-label="Account"
          className="rise absolute top-10 right-0 z-50 w-64 rounded-[3px] bg-overlay py-2 text-[14px] shadow-overlay"
        >
          <div className="border-b border-line px-4 pb-2.5">
            <p className="font-medium">{me ? me.display_name : "Not logged in"}</p>
            <p className="text-[12px] text-fg-subtlest">
              {me ? (me.role === "admin" ? "Team · can triage requests" : "Member") : "Browsing read-only"}
              {demoRole && ` · demo (${DEMO_LABEL[demoRole]})`}
            </p>
          </div>
          {!IS_DEMO && me && (
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="block w-full px-4 py-1.5 text-left hover:bg-hover"
            >
              Log out
            </button>
          )}
          {!IS_DEMO && !me && (
            <Link
              href="/login"
              role="menuitem"
              className="block px-4 py-1.5 hover:bg-hover"
              onClick={() => setOpen(false)}
            >
              Log in
            </Link>
          )}
          {IS_DEMO && (
            <p className="px-4 pt-2 text-[12px] text-fg-subtlest">Switch identity with the demo bar above.</p>
          )}
        </div>
      )}
    </div>
  );
}

const DEMO_OPTIONS: { value: DemoRole; hint: string }[] = [
  { value: "anon", hint: "Browse and search" },
  { value: "member", hint: "Sam Lindqvist: create, vote, comment" },
  { value: "admin", hint: "Maya Okafor: triage, merge, dashboard" },
];

export function DemoBar({ role }: { role: DemoRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="border-b border-line bg-[var(--lz-blue-bg)] text-[var(--lz-blue-fg)]">
      <div className="flex h-9 items-center gap-3 px-3 text-[13px] sm:px-4">
        <span className="font-semibold whitespace-nowrap">
          Demo<span className="hidden sm:inline"> workspace</span>
        </span>
        <span className="hidden opacity-90 md:inline">Seeded data that resets when the API restarts.</span>
        <span className="ml-auto hidden whitespace-nowrap opacity-90 sm:ml-2 sm:inline">View as</span>
        <div
          role="group"
          aria-label="Demo identity: view as"
          className="ml-auto flex rounded-[3px] bg-bg/70 p-0.5 sm:ml-0"
        >
          {DEMO_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={role === o.value}
              title={o.hint}
              onClick={() => {
                setDemoRole(o.value);
                start(() => router.refresh());
              }}
              className={`h-6 rounded-[2px] px-2 font-medium whitespace-nowrap ${
                role === o.value
                  ? "bg-primary text-on-primary"
                  : "text-fg-subtle hover:bg-hover hover:text-fg"
              }`}
            >
              {DEMO_LABEL[o.value]}
            </button>
          ))}
        </div>
        {pending && <span className="hidden opacity-80 sm:inline">Switching…</span>}
      </div>
    </div>
  );
}
