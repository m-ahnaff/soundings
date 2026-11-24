"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { safeNext } from "@/lib/safe-next";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { btn, field } from "@/components/ui";

type Mode = "magic" | "password" | "signup";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const id = useId();
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    params.get("error")
      ? { tone: "error", text: "That login link has expired or was already used. Request a new one." }
      : null,
  );
  const [, start] = useTransition();

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const go = () =>
    start(() => {
      router.push(next);
      router.refresh();
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabaseBrowser();
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        setMessage({
          tone: "ok",
          text: `We sent a login link to ${email}. It works once and expires in an hour.`,
        });
      } else if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return go();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(), data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (data.session) return go();
        setMessage({ tone: "ok", text: `Check ${email} to confirm your address, then you're in.` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Login failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "magic", label: "Email link" },
    { id: "password", label: "Password" },
    { id: "signup", label: "Sign up" },
  ];

  return (
    <div>
      <div role="group" aria-label="Login method" className="mb-5 flex gap-1 rounded-[3px] bg-hover p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={mode === t.id}
            onClick={() => {
              setMode(t.id);
              setMessage(null);
            }}
            className={`h-7 flex-1 rounded-[3px] text-[14px] font-medium ${
              mode === t.id ? "bg-bg text-fg shadow-raised" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-4">
        {mode === "signup" && (
          <div className="grid gap-1">
            <label htmlFor={`${id}-n`} className="text-[12px] font-semibold text-fg-subtle">
              Display name
            </label>
            <input
              id={`${id}-n`}
              className={`${field} h-9`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="nickname"
            />
            <p className="text-[12px] text-fg-subtlest">Shown on your requests and comments.</p>
          </div>
        )}
        <div className="grid gap-1">
          <label htmlFor={`${id}-e`} className="text-[12px] font-semibold text-fg-subtle">
            Email
          </label>
          <input
            id={`${id}-e`}
            className={`${field} h-9`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
        {mode !== "magic" && (
          <div className="grid gap-1">
            <label htmlFor={`${id}-p`} className="text-[12px] font-semibold text-fg-subtle">
              Password
            </label>
            <input
              id={`${id}-p`}
              className={`${field} h-9`}
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" && <p className="text-[12px] text-fg-subtlest">At least 8 characters.</p>}
          </div>
        )}
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={`rounded-[3px] px-3 py-2 text-[14px] ${
              message.tone === "error"
                ? "bg-[var(--lz-red-bg)] text-[var(--lz-red-fg)]"
                : "bg-[var(--lz-green-bg)] text-[var(--lz-green-fg)]"
            }`}
          >
            {message.text}
          </p>
        )}
        <button type="submit" className={`${btn.primary} h-9 w-full`} disabled={busy}>
          {busy
            ? "One moment…"
            : mode === "magic"
              ? "Email me a login link"
              : mode === "password"
                ? "Log in"
                : "Create account"}
        </button>
      </form>
    </div>
  );
}
