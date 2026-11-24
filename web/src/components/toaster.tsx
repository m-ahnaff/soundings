"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { IconX } from "@/components/icons";

type Tone = "neutral" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; href: string };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; action?: Toast["action"] }) => void;
  error: (message: string) => void;
  /** Screen-reader-only status message (one shared live region). */
  announce: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return ctx;
}

const DOT: Record<Tone, string> = {
  neutral: "bg-fg-subtlest",
  success: "bg-[var(--type-feature)]",
  error: "bg-danger",
};

/** Flags appear bottom-left, like a tracker's notifications. */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = nextId.current++;
      setToasts((all) => [
        ...all.slice(-2),
        { id, message, tone: opts?.tone ?? "neutral", action: opts?.action },
      ]);
      window.setTimeout(() => dismiss(id), opts?.tone === "error" || opts?.action ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (message) => show(message, { tone: "error" }),
      announce: (message) => setAnnouncement((prev) => (prev === message ? `${message} ` : message)),
    }),
    [show],
  );

  return (
    <ToastContext value={api}>
      {children}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rise pointer-events-auto flex items-start gap-3 rounded-[3px] bg-overlay px-4 py-3 text-[14px] text-fg shadow-overlay"
          >
            <span className={`mt-[7px] size-2 shrink-0 rounded-full ${DOT[t.tone]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="leading-5">{t.message}</p>
              {t.action && (
                <Link
                  href={t.action.href}
                  className="mt-1 inline-block font-medium text-link hover:underline"
                >
                  {t.action.label}
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mt-0.5 -mr-1 rounded-[3px] p-1 text-fg-subtlest hover:bg-hover hover:text-fg"
              aria-label="Dismiss"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
