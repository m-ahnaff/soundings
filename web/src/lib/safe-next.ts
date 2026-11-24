/** Same-origin relative path or "/". Rejects //host, /\\host and control characters. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f]/.test(raw)) return "/";
  try {
    const url = new URL(raw, "http://local.invalid");
    return url.origin === "http://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
