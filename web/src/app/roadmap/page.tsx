import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Lozenge, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { IconArrowUp } from "@/components/icons";
import { PageHeader } from "@/components/shell/shell";
import { getRoadmapCached } from "@/lib/api-server";
import { BOARD_NAME } from "@/lib/env";
import type { RoadmapItem } from "@/lib/types";

export const metadata: Metadata = { title: "Roadmap" };

const COLUMNS = [
  { key: "planned", title: "Planned", blurb: "Accepted and queued for an upcoming cycle." },
  { key: "in_progress", title: "In progress", blurb: "Being built now." },
  { key: "done", title: "Done", blurb: "Shipped. Update the app to get it." },
] as const;

export default function RoadmapPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects" }, { label: BOARD_NAME, href: "/" }]} title="Roadmap" />
      <p className="-mt-2 px-4 pb-4 text-[14px] text-fg-subtle sm:px-8">
        Requests the team has accepted, ordered by votes. No dates are promised; each request shows when its
        status changed. Refreshes every minute.
      </p>
      <Suspense fallback={<RoadmapSkeleton />}>
        <Columns />
      </Suspense>
    </>
  );
}

async function Columns() {
  await connection(); // fetched at request time, then shared from cache for a minute
  const roadmap = await getRoadmapCached();
  return (
    <div className="grid gap-4 px-4 pb-10 sm:px-8 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = roadmap[col.key];
        return (
          <section
            key={col.key}
            aria-labelledby={`rm-${col.key}`}
            className="min-w-0 rounded-[3px] bg-sunken"
          >
            <header className="px-3 pt-3 pb-2">
              <h2 id={`rm-${col.key}`} className="flex items-center gap-2">
                <Lozenge status={col.key} />
                <span className="text-[12px] text-fg-subtle tnum">
                  {items.length}
                  {items.length === 50 ? "+" : ""} {items.length === 1 ? "request" : "requests"}
                </span>
              </h2>
              <p className="mt-1 text-[12px] text-fg-subtlest">{col.blurb}</p>
            </header>
            {items.length === 0 ? (
              <p className="px-3 pb-4 text-[14px] text-fg-subtlest">Nothing here right now.</p>
            ) : (
              <ol className="grid gap-1.5 px-1.5 pb-1.5">
                {items.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ item }: { item: RoadmapItem }) {
  return (
    <li>
      <Link
        href={`/p/${item.id}`}
        className="block rounded-[3px] border border-line bg-bg p-2.5 hover:bg-hover"
      >
        <span className="line-clamp-2 text-[14px] leading-5 text-fg">{item.title}</span>
        <span className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-subtle">
          <TypeIcon type={item.category} />
          <span className="font-medium">{issueKey(item.number)}</span>
          <span
            className="ml-auto inline-flex items-center gap-1 font-semibold tnum"
            title={`${item.vote_count} votes`}
          >
            <IconArrowUp size={13} />
            {item.vote_count}
            <span className="sr-only">votes</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="grid gap-4 px-4 sm:px-8 md:grid-cols-3" aria-busy="true">
      {[5, 4, 5].map((n, c) => (
        <div key={c} className="rounded-[3px] bg-sunken p-1.5" aria-hidden="true">
          <div className="skeleton m-1.5 mb-3 h-4 w-28" />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="mb-1.5 h-[68px] rounded-[3px] border border-line bg-bg" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading roadmap…</span>
    </div>
  );
}
