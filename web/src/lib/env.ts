// Public configuration. NEXT_PUBLIC_* values are inlined at build time.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8800").replace(/\/$/, "");

/** Demo mode exists only when no Supabase project is configured. */
export const IS_DEMO = SUPABASE_URL === "";

export const DEMO_COOKIE = "sd_demo_user";
export type DemoRole = "anon" | "member" | "admin";

export const BOARD_NAME = process.env.NEXT_PUBLIC_BOARD_NAME ?? "Larder";
