import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { API_URL, DEMO_COOKIE, IS_DEMO, type DemoRole } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toApiError, type Me, type Roadmap } from "@/lib/types";

export interface Identity {
  signedIn: boolean;
  demoRole: DemoRole | null;
  headers: Record<string, string>;
}

/** Who is browsing, resolved once per request. */
export const getIdentity = cache(async (): Promise<Identity> => {
  if (IS_DEMO) {
    const raw = (await cookies()).get(DEMO_COOKIE)?.value;
    const role: DemoRole = raw === "member" || raw === "admin" ? raw : "anon";
    return {
      signedIn: role !== "anon",
      demoRole: role,
      headers: role === "anon" ? {} : { "X-Demo-User": role },
    };
  }
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    signedIn: Boolean(token),
    demoRole: null,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
});

/** GET from the API as the current viewer. Returns null on 404. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const identity = await getIdentity();
  let res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: "application/json", ...identity.headers },
    cache: "no-store",
  });
  if (
    res.status === 401 &&
    identity.signedIn &&
    !path.startsWith("/v1/me") &&
    !path.startsWith("/v1/admin")
  ) {
    // Stale or revoked session: show the public page read-only instead of an error.
    res = await fetch(`${API_URL}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export const getMe = cache(async (): Promise<Me | null> => {
  const identity = await getIdentity();
  if (!identity.signedIn) return null;
  try {
    return await apiGet<Me>("/v1/me");
  } catch {
    return null;
  }
});

/**
 * The roadmap is the same for everyone, so it is fetched anonymously and kept
 * for a minute. Admin status changes expire it immediately via updateTag.
 */
export async function getRoadmapCached(): Promise<Roadmap> {
  "use cache";
  cacheLife("minutes");
  cacheTag("roadmap");
  const res = await fetch(`${API_URL}/v1/roadmap`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as Roadmap;
}
