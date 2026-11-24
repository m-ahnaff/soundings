import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FilterBar } from "@/components/list/filter-bar";
import { IssueTable } from "@/components/list/issue-table";
import { PageHeader } from "@/components/shell/shell";
import { FilterBarSkeleton, TableSkeleton } from "@/components/skeletons";
import { apiGet, getIdentity, getMe } from "@/lib/api-server";
import { BOARD_NAME, IS_DEMO } from "@/lib/env";
import { apiQuery, parseFilters, type SP } from "@/lib/query";
import type { PostList } from "@/lib/types";

export const metadata: Metadata = { title: "All requests" };

const PER_PAGE = 25;
const CRUMBS = [{ label: "Projects" }, { label: BOARD_NAME, href: "/" }];

export default function RequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={CRUMBS} title="All requests" />
          <FilterBarSkeleton />
          <TableSkeleton />
        </>
      }
    >
      <Requests searchParams={searchParams} />
    </Suspense>
  );
}

async function Requests({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, identity, me] = await Promise.all([searchParams, getIdentity(), getMe()]);
  const { view, sort, page, mine } = parseFilters(sp, { allowStatus: true });
  const keys = [...view.keys()].sort().join(",");
  const title =
    keys === "mine"
      ? "My requests"
      : keys === "sort" && sort === "updated"
        ? "Recently updated"
        : keys === "sort,status" && sort === "top" && view.get("status") === "open"
          ? "Most voted (open)"
          : "All requests";

  if (mine && !identity.signedIn) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} title="My requests" />
        <div className="mx-4 max-w-lg rounded-[3px] border border-line px-5 py-5 sm:mx-8">
          <p className="text-[16px] font-medium">Log in to see the requests you created</p>
          <p className="mt-1 text-[14px] text-fg-subtle">
            {IS_DEMO
              ? "Switch to Member in the demo bar at the top."
              : "Your requests are listed here once you log in."}
          </p>
        </div>
      </>
    );
  }

  const data = await apiGet<PostList>(
    `/v1/posts?${apiQuery(view, { limit: String(PER_PAGE), offset: String((page - 1) * PER_PAGE) })}`,
  );
  if (data && data.items.length === 0 && data.total > 0 && page > 1) {
    // Past the last page (stale link): go to the last real page.
    const qs = new URLSearchParams(view);
    const last = Math.ceil(data.total / PER_PAGE);
    if (last > 1) qs.set("page", String(last));
    redirect(`/requests${qs.toString() ? `?${qs}` : ""}`);
  }
  return (
    <>
      <PageHeader crumbs={CRUMBS} title={title} />
      <FilterBar showStatus showSort signedIn={identity.signedIn}>
        {data && (
          <IssueTable
            data={data}
            me={me}
            signedIn={identity.signedIn}
            sort={sort}
            query={view.toString()}
            page={page}
            perPage={PER_PAGE}
          />
        )}
      </FilterBar>
    </>
  );
}
