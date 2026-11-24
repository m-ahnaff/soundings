import type { ReactNode } from "react";

/**
 * Markdown-lite: paragraphs, line breaks, "- " lists, **bold**, *italic*,
 * `code` and bare http(s) links. Builds React nodes directly, so user text is
 * never injected as HTML.
 */
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) out.push(<em key={key}>{token.slice(1, -1)}</em>);
    else
      out.push(
        <a key={key} href={token} rel="nofollow ugc noopener noreferrer" target="_blank">
          {token.replace(/^https?:\/\//, "")}
        </a>,
      );
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, idx) => [
    ...(idx > 0 ? [<br key={`${keyPrefix}-br-${idx}`} />] : []),
    ...inline(line, `${keyPrefix}-${idx}`),
  ]);
}

export function MarkdownLite({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/);
  return (
    <div className={`prose-lite ${className}`}>
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={b}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${b}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={b}>{withBreaks(lines, String(b))}</p>;
      })}
    </div>
  );
}

/** Plain-text excerpt for list rows (markup stripped). */
export function excerpt(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
