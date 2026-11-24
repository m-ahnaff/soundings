"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BOARD_NAME } from "@/lib/env";
import {
  IconBoard,
  IconChart,
  IconChevronLeft,
  IconFilter,
  IconList,
  IconRoadmap,
  IconX,
} from "@/components/icons";
import { ProjectMark } from "@/components/icons";
import { btn } from "@/components/ui";

type Key = "board" | "roadmap" | "requests" | "dashboard" | "mine" | "top" | "updated" | null;

function closeDrawer() {
  document.documentElement.removeAttribute("data-drawer");
}

export function toggleSidebar() {
  const root = document.documentElement;
  const collapsed = root.getAttribute("data-sidebar") === "collapsed";
  if (collapsed) root.removeAttribute("data-sidebar");
  else root.setAttribute("data-sidebar", "collapsed");
  try {
    localStorage.setItem("sidebar", collapsed ? "open" : "collapsed");
  } catch {
    // not persisted
  }
}

function Item({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={closeDrawer}
        className={`relative flex h-8 items-center gap-2.5 rounded-[3px] px-2 text-[14px] ${
          active ? "bg-selected font-medium text-primary" : "text-fg-subtle hover:bg-hover hover:text-fg"
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-r bg-primary"
          />
        )}
        <span className={active ? "text-primary" : "text-fg-subtlest"}>{icon}</span>
        {label}
      </Link>
    </li>
  );
}

export function SidebarLinks({ active, isAdmin }: { active: Key; isAdmin: boolean }) {
  return (
    <div className="flex h-full w-[240px] flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <ProjectMark size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-5 font-semibold">{BOARD_NAME}</p>
          <p className="truncate text-[12px] leading-4 text-fg-subtlest">Feedback project</p>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          data-drawer-close
          className={`${btn.subtle} w-8 px-0 md:hidden`}
          aria-label="Close navigation"
        >
          <IconX />
        </button>
      </div>
      <nav aria-label="Project" className="flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="mt-3 mb-1 px-2 text-[11px] font-bold tracking-[0.04em] text-fg-subtlest uppercase">
          Planning
        </h2>
        <ul className="grid gap-0.5">
          <Item href="/" icon={<IconBoard />} label="Board" active={active === "board"} />
          <Item href="/roadmap" icon={<IconRoadmap />} label="Roadmap" active={active === "roadmap"} />
          <Item href="/requests" icon={<IconList />} label="All requests" active={active === "requests"} />
        </ul>
        <h2 className="mt-5 mb-1 px-2 text-[11px] font-bold tracking-[0.04em] text-fg-subtlest uppercase">
          Filters
        </h2>
        <ul className="grid gap-0.5">
          <Item
            href="/requests?mine=1"
            icon={<IconFilter />}
            label="My requests"
            active={active === "mine"}
          />
          <Item
            href="/requests?status=open&sort=top"
            icon={<IconFilter />}
            label="Most voted (open)"
            active={active === "top"}
          />
          <Item
            href="/requests?sort=updated"
            icon={<IconFilter />}
            label="Recently updated"
            active={active === "updated"}
          />
        </ul>
      </nav>
      {/* Team-only items sit at the bottom so the nav above never shifts when the role streams in. */}
      {isAdmin && (
        <div className="px-4 pb-2">
          <h2 className="mb-1 px-2 text-[11px] font-bold tracking-[0.04em] text-fg-subtlest uppercase">
            Team
          </h2>
          <ul>
            <Item href="/admin" icon={<IconChart />} label="Dashboard" active={active === "dashboard"} />
          </ul>
        </div>
      )}
      <div className="hidden border-t border-line px-4 py-2 md:block">
        <button type="button" onClick={toggleSidebar} className={`${btn.subtle} w-full justify-start`}>
          <IconChevronLeft />
          Collapse sidebar
        </button>
      </div>
    </div>
  );
}

/** Live version: knows the current route (needs request data, so it streams in). */
export function SidebarLive({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => closeDrawer(), [pathname]);

  let active: Key = null;
  if (pathname === "/") active = "board";
  else if (pathname.startsWith("/roadmap")) active = "roadmap";
  else if (pathname.startsWith("/admin")) active = "dashboard";
  else if (pathname.startsWith("/requests")) {
    const filtered = params.get("q") || params.get("category");
    const status = params.get("status");
    if (params.get("mine") && !filtered && !status) active = "mine";
    else if (params.get("sort") === "top" && status === "open" && !filtered) active = "top";
    else if (params.get("sort") === "updated" && !filtered && !status) active = "updated";
    else active = "requests";
  }
  return <SidebarLinks active={active} isAdmin={isAdmin} />;
}

/** Tracks <html data-drawer="open"> (set by the menu button / scrim / links). */
export function useDrawerOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setOpen(root.getAttribute("data-drawer") === "open");
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-drawer"] });
    return () => mo.disconnect();
  }, []);
  return open;
}

export function DrawerScrim() {
  const open = useDrawerOpen();
  // Mobile drawer a11y: closed drawer is inert (out of tab order); opening it
  // moves focus inside; Esc closes and returns focus to the menu button.
  useEffect(() => {
    const aside = document.querySelector<HTMLElement>(".sidebar-panel");
    if (!aside) return;
    const mq = window.matchMedia("(max-width: 767.98px)");
    const apply = () => {
      aside.inert = mq.matches && !open;
    };
    apply();
    mq.addEventListener("change", apply);
    if (open && mq.matches) aside.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        closeDrawer();
        document.querySelector<HTMLElement>("[data-drawer-toggle]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div
      className="drawer-scrim fixed inset-0 z-40 bg-[rgb(9_14_24/0.45)] md:hidden"
      aria-hidden="true"
      onClick={closeDrawer}
    />
  );
}

export function ExpandSidebarButton() {
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Expand sidebar"
      className="expand-sidebar absolute top-3 left-2 z-10 hidden size-6 items-center justify-center rounded-full border border-line bg-bg text-fg-subtle shadow-raised hover:bg-primary hover:text-on-primary"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  );
}
