"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Me, PostList, Sort } from "@/lib/types";
import { Avatar, Lozenge, RelativeTime, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { IconChevronLeft, IconChevronRight, IconSort } from "@/components/icons";
import { IssuePanel } from "@/components/issue/issue-view";
import { useListKeys } from "@/components/issue/use-list-keys";
import { isPlainClick, useSelectedIssue } from "@/components/issue/use-selected";
import { openCreate } from "@/components/shell/top-nav-client";
import { VoteButton } from "@/components/vote-button";

interface Props {
  data: PostList;
  me: Me | null;
  signedIn: boolean;
  sort: Sort;
  /** Current filters (without page) for building links. */
  query: string;
  page: number;
  perPage: number;
}

function hrefWith(query: string, patch: Record<string, string | null>): string {
  const qs = new URLSearchParams(query);
  for (const [k, v] of Object.entries(patch)) {
    if (v) qs.set(k, v);
    else qs.delete(k);
  }
  const s = qs.toString();
  return s ? `/requests?${s}` : "/requests";
}

export function IssueTable({ data, me, signedIn, sort, query, page, perPage }: Props) {
  const { selected, select } = useSelectedIssue();
  const tableRef = useRef<HTMLTableSectionElement>(null);
  useListKeys(tableRef, select, selected);

  const first = data.total === 0 ? 0 : data.offset + 1;
  const last = data.offset + data.items.length;
  const pages = Math.max(1, Math.ceil(data.total / perPage));

  if (data.total === 0) {
    const q = new URLSearchParams(query).get("q");
    return (
      <div className="mx-4 rounded-[3px] border border-dashed border-line px-6 py-10 text-center sm:mx-8">
        <p className="text-[16px] font-medium">
          {q ? <>No requests match &ldquo;{q}&rdquo;</> : "No requests match these filters"}
        </p>
        <p className="mt-1 text-[14px] text-fg-subtle">
          {q
            ? "Try fewer words or check the spelling. If it's genuinely new, create it."
            : "Clear a filter to see more."}
        </p>
        <button
          type="button"
          onClick={() => openCreate(q ?? undefined)}
          className="mt-4 h-8 rounded-[3px] bg-primary px-3 text-[14px] font-medium text-on-primary hover:bg-primary-hover"
        >
          Create request
        </button>
        <p className="sr-only" role="status">
          No results
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 sm:px-8">
      <p className="sr-only" role="status">
        {data.total} {data.total === 1 ? "request" : "requests"} found
      </p>
      <div className="overflow-x-auto rounded-[3px] border border-line">
        <table className="w-full min-w-[340px] border-collapse text-left text-[14px]">
          <thead className="border-b-2 border-line text-[12px] text-fg-subtle">
            <tr>
              <th scope="col" className="w-9 py-2 pl-3">
                <span className="sr-only">Type</span>
              </th>
              <th scope="col" className="px-2 py-2 font-semibold whitespace-nowrap">
                Key
              </th>
              <th scope="col" className="w-full px-2 py-2 font-semibold">
                Summary
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Status
              </th>
              <SortHeader sort={sort} query={query} label="Votes" value="top" className="text-right" />
              <th scope="col" className="hidden px-2 py-2 text-right font-semibold md:table-cell">
                Comments
              </th>
              <th scope="col" className="hidden px-2 py-2 font-semibold lg:table-cell">
                Reporter
              </th>
              <SortHeader
                sort={sort}
                query={query}
                label="Created"
                value="new"
                className="hidden whitespace-nowrap xl:table-cell"
              />
              <SortHeader
                sort={sort}
                query={query}
                label="Updated"
                value="updated"
                className="hidden pr-3 whitespace-nowrap md:table-cell"
              />
            </tr>
          </thead>
          <tbody ref={tableRef}>
            {data.items.map((p) => {
              const isSel = selected === p.id;
              const name = p.author?.display_name ?? "Former member";
              return (
                <tr
                  key={p.id}
                  data-item={p.id}
                  aria-current={isSel ? "true" : undefined}
                  className={`border-b border-line last:border-b-0 focus-within:bg-hover ${
                    isSel ? "bg-selected" : "hover:bg-hover"
                  }`}
                >
                  <td className="py-1.5 pl-3">
                    <TypeIcon type={p.category} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <a
                      href={`/p/${p.id}`}
                      data-item-link
                      onClick={(e) => {
                        if (isPlainClick(e)) {
                          e.preventDefault();
                          select(p.id);
                        }
                      }}
                      className="text-link hover:underline"
                    >
                      {issueKey(p.number)}
                    </a>
                  </td>
                  <td className="max-w-0 min-w-[180px] px-2 py-1.5">
                    <a
                      href={`/p/${p.id}`}
                      tabIndex={-1}
                      onClick={(e) => {
                        if (isPlainClick(e)) {
                          e.preventDefault();
                          select(p.id);
                        }
                      }}
                      className="block truncate text-fg hover:text-link hover:underline"
                      title={p.title}
                    >
                      {p.pinned && (
                        <span className="mr-1 text-[12px] font-semibold text-fg-subtlest">Pinned ·</span>
                      )}
                      {p.title}
                    </a>
                  </td>
                  <td className="px-2 py-1.5">
                    <Lozenge status={p.status} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <VoteButton
                      key={`${p.vote_count}:${p.has_voted}`}
                      postId={p.id}
                      title={p.title}
                      count={p.vote_count}
                      voted={p.has_voted}
                      signedIn={signedIn}
                      closed={p.status === "merged"}
                    />
                  </td>
                  <td className="hidden px-2 py-1.5 text-right text-fg-subtle tnum md:table-cell">
                    {p.comment_count}
                  </td>
                  <td className="hidden px-2 py-1.5 lg:table-cell">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={name} size={22} />
                      <span className="max-w-[140px] truncate">{name}</span>
                    </span>
                  </td>
                  <td className="hidden px-2 py-1.5 whitespace-nowrap text-fg-subtle xl:table-cell">
                    <RelativeTime iso={p.created_at} />
                  </td>
                  <td className="hidden px-2 py-1.5 pr-3 whitespace-nowrap text-fg-subtle md:table-cell">
                    <RelativeTime iso={p.updated_at} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Pagination"
        className="mt-3 flex items-center justify-between text-[14px] text-fg-subtle"
      >
        <span className="tnum">
          {first}–{last} of {data.total}
        </span>
        <div className="flex items-center gap-1">
          <PageLink
            disabled={page <= 1}
            href={hrefWith(query, { page: page > 2 ? String(page - 1) : null })}
            label="Previous page"
          >
            <IconChevronLeft />
          </PageLink>
          <span className="px-2 tnum">
            Page {page} of {pages}
          </span>
          <PageLink
            disabled={page >= pages}
            href={hrefWith(query, { page: String(page + 1) })}
            label="Next page"
          >
            <IconChevronRight />
          </PageLink>
        </div>
      </nav>
      {selected && <IssuePanel id={selected} me={me} signedIn={signedIn} onClose={() => select(null)} />}
    </div>
  );
}

function SortHeader({
  label,
  value,
  className = "",
  sort,
  query,
}: {
  label: string;
  value: Sort;
  className?: string;
  sort: Sort;
  query: string;
}) {
  const activeSort = sort === value;
  return (
    <th
      scope="col"
      aria-sort={activeSort ? "descending" : "none"}
      className={`px-2 py-2 font-semibold ${className}`}
    >
      <Link
        href={hrefWith(query, { sort: value, page: null })}
        replace
        scroll={false}
        className={`inline-flex items-center gap-1 rounded-[3px] hover:text-fg ${activeSort ? "text-fg" : ""}`}
      >
        {label}
        <IconSort dir={activeSort ? "desc" : "none"} size={12} />
      </Link>
    </th>
  );
}

function PageLink({
  disabled,
  href,
  label,
  children,
}: {
  disabled: boolean;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex size-8 items-center justify-center rounded-[3px] text-fg-subtlest opacity-50"
      >
        {children}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex size-8 items-center justify-center rounded-[3px] hover:bg-hover hover:text-fg"
      aria-label={label}
    >
      {children}
    </Link>
  );
}
