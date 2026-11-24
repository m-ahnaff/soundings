"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconX } from "@/components/icons";

export const field =
  "w-full rounded-[3px] border border-control bg-bg px-2 text-[14px] text-fg placeholder:text-fg-subtlest hover:bg-sunken focus:border-focus focus:bg-bg";

export const selectCls =
  "h-8 appearance-none rounded-[3px] border border-control bg-bg bg-[length:12px] bg-[right_8px_center] bg-no-repeat pr-7 pl-2 text-[14px] text-fg hover:bg-sunken bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 6 8 10.5 12.5 6' fill='none' stroke='%23778196' stroke-width='1.8'/%3E%3C/svg%3E\")]";

export const btn = {
  primary:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] bg-primary px-3 text-[14px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
  default:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] bg-hover px-3 text-[14px] font-medium text-fg-subtle hover:bg-pressed hover:text-fg disabled:opacity-50",
  subtle:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] px-2 text-[14px] font-medium text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-50",
  danger:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] bg-danger px-3 text-[14px] font-medium text-on-danger hover:opacity-90 disabled:opacity-50",
};

/** Native <dialog>: focus trap, Esc and top-layer for free. */
export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  width = 600,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      style={{ width: `min(${width}px, calc(100vw - 1rem))` }}
      className="m-auto max-h-[calc(100dvh-2rem)] rounded-[3px] bg-overlay p-0 text-fg shadow-overlay"
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 id={titleId} className="text-[20px] leading-6 font-medium">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={`${btn.subtle} -mr-2 w-8 px-0`}
              aria-label="Close"
            >
              <IconX />
            </button>
          </div>
          <div className="px-6 pb-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 px-6 pt-2 pb-5">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "danger",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button type="button" className={btn.subtle} onClick={onClose} autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className={tone === "danger" ? btn.danger : btn.primary}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[14px] text-fg-subtle">{children}</div>
    </Modal>
  );
}
