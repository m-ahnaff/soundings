"use server";

import { updateTag } from "next/cache";
import { getMe } from "@/lib/api-server";

/**
 * Called after an admin changes status, merges or deletes, so the roadmap is
 * fresh immediately. Server Actions are public endpoints, so only admins may
 * expire the shared cache (otherwise anyone could turn it into pass-through load).
 */
export async function expireRoadmap(): Promise<void> {
  const me = await getMe();
  if (me?.role !== "admin") return;
  updateTag("roadmap");
}
