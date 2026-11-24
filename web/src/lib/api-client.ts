"use client";

import { API_URL, DEMO_COOKIE, IS_DEMO } from "@/lib/env";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { ApiError, toApiError } from "@/lib/types";

export function readDemoRole(): "anon" | "member" | "admin" {
  if (typeof document === "undefined") return "anon";
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEMO_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : "anon";
  return value === "member" || value === "admin" ? value : "anon";
}

async function authHeaders(): Promise<Record<string, string>> {
  if (IS_DEMO) {
    const role = readDemoRole();
    return role === "anon" ? {} : { "X-Demo-User": role };
  }
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Call the API from the browser as the signed-in user. Throws ApiError. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(await authHeaders()),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network", "Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Try again.";
}

export function setDemoRole(role: "anon" | "member" | "admin"): void {
  document.cookie = `${DEMO_COOKIE}=${role}; path=/; max-age=2592000; samesite=lax`;
}
