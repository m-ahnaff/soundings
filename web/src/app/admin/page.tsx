import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { StatusBreakdown, WeeklyBars } from "@/components/admin/charts";
import { Lozenge, TypeIcon } from "@/components/bits";
import { issueKey } from "@/lib/format";
import { PageHeader } from "@/components/shell/shell";
import { GadgetsSkeleton } from "@/components/skeletons";
import { apiGet, getMe } from "@/lib/api-server";
import { BOARD_NAME, IS_DEMO } from "@/lib/env";
import type { Stats } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects" }, { label: BOARD_NAME, href: "/" }]} title="Dashboard" />
      <Suspense fallback={<GadgetsSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

function Gadget({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `g-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-[3px] border border-line bg-bg ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id={id} className="text-[14px] font-semibold">
          {title}
        </h2>
        {meta && <span className="text-[12px] text-fg-subtlest">{meta}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

async function Dashboard() {
  const me = await getMe();
  if (me?.role !== "admin") {
    return (
      <div className="mx-4 max-w-lg rounded-[3px] border border-line px-5 py-5 sm:mx-8">
        <p className="text-[16px] font-medium">You don&rsquo;t have access to this dashboard</p>
        <p className="mt-1 text-[14px] text-fg-subtle">
          {IS_DEMO ? "Switch to Admin in the demo bar to see it." : "Ask a project admin for team access."}
        </p>
      </div>
    );
  }
  const stats = await apiGet<Stats>("/v1/admin/stats");
  if (!stats) return null;
  const weekTotal = stats.posts_per_week.reduce((s, w) => s + w.count, 0);
  const tiles: [string, number, string][] = [
    ["Requests", stats.total_posts, "All statuses, merged duplicates excluded"],
    ["Votes", stats.total_votes, `${stats.total_comments} comments`],
    ["Created this week", stats.new_posts_week, "Last 7 days"],
    ["Votes this week", stats.votes_week, "Last 7 days"],
  ];

  return (
    <div className="grid gap-4 px-4 pb-10 sm:px-8 lg:grid-cols-2">
      <Gadget title="Summary" className="lg:col-span-2">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[3px] bg-line md:grid-cols-4">
          {tiles.map(([label, value, note]) => (
            <div key={label} className="bg-bg px-3 py-3">
              <dt className="text-[12px] font-semibold text-fg-subtle">{label}</dt>
              <dd className="mt-1 text-[24px] leading-7 font-semibold tnum">{value.toLocaleString("en")}</dd>
              <dd className="text-[12px] text-fg-subtlest">{note}</dd>
            </div>
          ))}
        </dl>
      </Gadget>

      <Gadget title="Created per week" meta={`${weekTotal} in the last 8 weeks`}>
        <WeeklyBars data={stats.posts_per_week} />
        <details className="mt-2 text-[12px] text-fg-subtle">
          <summary className="cursor-pointer hover:text-fg">View as table</summary>
          <table className="mt-2 w-full max-w-xs text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12px]">
                <th className="py-1 font-semibold">Week starting</th>
                <th className="py-1 text-right font-semibold">Requests</th>
              </tr>
            </thead>
            <tbody>
              {stats.posts_per_week.map((w) => (
                <tr key={w.week_start} className="border-b border-line last:border-b-0">
                  <td className="py-1">{w.week_start}</td>
                  <td className="py-1 text-right tnum">{w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Gadget>

      <Gadget title="Status breakdown" meta="All requests">
        <StatusBreakdown breakdown={stats.status_breakdown} />
      </Gadget>

      <Gadget title="Top 10 by votes" className="lg:col-span-2">
        <div className="-m-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead className="border-b-2 border-line text-[12px] text-fg-subtle">
              <tr>
                <th scope="col" className="w-9 py-2 pl-4 font-semibold">
                  <span className="sr-only">Type</span>
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Key
                </th>
                <th scope="col" className="w-full px-2 py-2 font-semibold">
                  Summary
                </th>
                <th scope="col" className="px-2 py-2 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">
                  Comments
                </th>
                <th scope="col" className="py-2 pr-4 pl-2 text-right font-semibold">
                  Votes
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.top_posts.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="py-1.5 pl-4">
                    <TypeIcon type={p.category} />
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Link href={`/p/${p.id}`} className="text-link hover:underline">
                      {issueKey(p.number)}
                    </Link>
                  </td>
                  <td className="max-w-0 px-2 py-1.5">
                    <span className="block truncate">{p.title}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Lozenge status={p.status} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-fg-subtle tnum">{p.comment_count}</td>
                  <td className="py-1.5 pr-4 pl-2 text-right font-semibold tnum">{p.vote_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Gadget>
    </div>
  );
}
