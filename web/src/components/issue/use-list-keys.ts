"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isTypingTarget, shortcutsEnabled } from "@/components/shell/shortcuts";

/**
 * j / k move between [data-item] elements (cards or rows), v votes on the
 * focused one, o opens it. While the details panel is open, j / k step the
 * panel to the next/previous request instead (like a tracker's issue view).
 */
export function useListKeys(
  container: RefObject<HTMLElement | null>,
  onOpen: (id: string) => void,
  selected: string | null,
) {
  const latest = useRef({ onOpen, selected });
  useEffect(() => {
    latest.current = { onOpen, selected };
  });

  useEffect(() => {
    function items() {
      return Array.from(container.current?.querySelectorAll<HTMLElement>("[data-item]") ?? []);
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || !shortcutsEnabled()) return;
      if (document.querySelector("dialog[open]")) return;
      if (!["j", "k", "v", "o"].includes(e.key)) return;
      const all = items();
      if (!all.length) return;
      const { onOpen, selected } = latest.current;

      if (selected) {
        if (e.key !== "j" && e.key !== "k") return; // v / o act on the panel's own controls
        e.preventDefault();
        const at = all.findIndex((el) => el.dataset.item === selected);
        const next = all[Math.max(0, Math.min(all.length - 1, at + (e.key === "j" ? 1 : -1)))];
        if (next?.dataset.item && next.dataset.item !== selected) {
          onOpen(next.dataset.item);
          next.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        return;
      }

      const at = all.findIndex((el) => el.contains(document.activeElement));
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = at < 0 ? 0 : Math.max(0, Math.min(all.length - 1, at + (e.key === "j" ? 1 : -1)));
        all[next].querySelector<HTMLElement>("[data-item-link]")?.focus({ preventScroll: true });
        all[next].scrollIntoView({ block: "nearest", inline: "nearest" });
      } else if (at >= 0 && e.key === "v") {
        e.preventDefault();
        all[at].querySelector<HTMLButtonElement>("[data-vote-button]")?.click();
      } else if (at >= 0 && e.key === "o") {
        e.preventDefault();
        const id = all[at].dataset.item;
        if (id) onOpen(id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [container]);
}
