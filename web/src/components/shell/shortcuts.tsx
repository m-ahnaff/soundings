"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/bits";
import { toggleSidebar } from "@/components/shell/sidebar-client";
import { EVT, openCreate } from "@/components/shell/top-nav-client";
import { Modal } from "@/components/ui";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

const OFF_KEY = "soundings:shortcuts-off";

/** Single-key shortcuts can be switched off (WCAG 2.1.4), e.g. for speech input. */
export function shortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Global",
    keys: [
      [["c"], "Create a request"],
      [["/"], "Search"],
      [["g", "b"], "Go to board"],
      [["g", "l"], "Go to all requests"],
      [["g", "r"], "Go to roadmap"],
      [["g", "d"], "Go to dashboard (team)"],
      [["["], "Collapse or expand sidebar"],
      [["?"], "Show shortcuts"],
    ],
  },
  {
    title: "Board and list",
    keys: [
      [["j"], "Next request"],
      [["k"], "Previous request"],
      [["v"], "Vote / remove vote"],
      [["o"], "Open details (or Enter)"],
      [["Esc"], "Close details panel"],
    ],
  },
];

export function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const openHelp = () => {
      setEnabled(shortcutsEnabled());
      setOpen(true);
    };
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      if (!shortcutsEnabled() && e.key !== "?") return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const dest = ({ b: "/", l: "/requests", r: "/roadmap", d: "/admin" } as Record<string, string>)[
          e.key
        ];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }
      switch (e.key) {
        case "/": {
          const input = document.getElementById("list-search") ?? document.getElementById("global-search");
          if (input && input.offsetParent !== null) {
            e.preventDefault();
            input.focus();
          } else {
            e.preventDefault();
            router.push("/requests?focus=search");
          }
          break;
        }
        case "c":
        case "n":
          e.preventDefault();
          openCreate();
          break;
        case "[":
          e.preventDefault();
          toggleSidebar();
          break;
        case "?":
          e.preventDefault();
          openHelp();
          break;
        case "g":
          pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVT.help, openHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVT.help, openHelp);
    };
  }, [router]);

  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={() => setOpen(false)} width={520}>
      <div className="grid gap-5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-[11px] font-bold tracking-[0.04em] text-fg-subtlest uppercase">
              {g.title}
            </h3>
            <dl className="grid gap-1.5 text-[14px]">
              {g.keys.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-fg-subtle">{label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 && <span className="text-[12px] text-fg-subtlest">then</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <label className="mt-5 flex items-center gap-2 border-t border-line pt-3 text-[14px] text-fg-subtle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            try {
              if (e.target.checked) localStorage.removeItem(OFF_KEY);
              else localStorage.setItem(OFF_KEY, "1");
            } catch {
              // not persisted
            }
          }}
          className="size-4 accent-[var(--primary)]"
        />
        Single-key shortcuts on (? always opens this list)
      </label>
    </Modal>
  );
}
