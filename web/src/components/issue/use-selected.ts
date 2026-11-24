"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

const PARAM = "selectedIssue";

/**
 * The open request lives in the URL (?selectedIssue=<id>) so the panel is
 * linkable and Back closes it. Uses the History API directly (Next keeps
 * useSearchParams in sync) so opening a panel doesn't re-render the server page.
 */
export function useSelectedIssue() {
  const params = useSearchParams();
  const selected = params.get(PARAM);
  const pushed = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);

  const select = useCallback(
    (id: string | null) => {
      const url = new URL(window.location.href);
      if (id) {
        if (!selected) {
          // Remember what opened the panel so focus can return there on close.
          trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
        url.searchParams.set(PARAM, id);
        if (selected)
          window.history.replaceState(null, "", url); // switching issues: no extra history entry
        else {
          window.history.pushState(null, "", url);
          pushed.current = true;
        }
        return;
      }
      if (pushed.current) {
        pushed.current = false;
        window.history.back(); // we added the entry, so Back is the honest close
      } else {
        url.searchParams.delete(PARAM);
        window.history.replaceState(null, "", url);
      }
      const back =
        trigger.current ?? document.querySelector<HTMLElement>(`[data-item="${selected}"] [data-item-link]`);
      trigger.current = null;
      window.setTimeout(() => back?.focus({ preventScroll: false }), 0);
    },
    [selected],
  );

  return { selected, select };
}

/** Plain left-click opens the panel; modified clicks keep normal link behaviour. */
export function isPlainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
