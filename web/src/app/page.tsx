import { Suspense } from "react";
import { Kanban, type Columns } from "@/components/board/kanban";
import { FilterBar } from "@/components/list/filter-bar";
import { PageHeader } from "@/components/shell/shell";
import { BoardSkeleton, FilterBarSkeleton } from "@/components/skeletons";
import { apiGet, getIdentity, getMe } from "@/lib/api-server";
import { BOARD_NAME } from "@/lib/env";
import { STATUS_ORDER } from "@/lib/format";
import { apiQuery, parseFilters, type SP } from "@/lib/query";
import type { PostList, SettableStatus } from "@/lib/types";

export default function BoardPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader crumbs={[{ label: "Projects" }, { label: BOARD_NAME, href: "/" }]} title="Board" />
      <Suspense
        fallback={
          <>
            <FilterBarSkeleton />
            <BoardSkeleton />
          </>
        }
      >
        <BoardData searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function BoardData({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, identity, me] = await Promise.all([searchParams, getIdentity(), getMe()]);
  const { view } = parseFilters(sp, { allowStatus: false });
  if (!identity.signedIn) view.delete("mine"); // "my requests" means nothing signed out
  const lists = await Promise.all(
    (STATUS_ORDER as SettableStatus[]).map((status) =>
      apiGet<PostList>(`/v1/posts?${apiQuery(view, { status, sort: "top", limit: "50" })}`),
    ),
  );
  const columns = Object.fromEntries(
    (STATUS_ORDER as SettableStatus[]).map((s, i) => [
      s,
      { items: lists[i]?.items ?? [], total: lists[i]?.total ?? 0 },
    ]),
  ) as Columns;
  return (
    <FilterBar showStatus={false} showSort={false} signedIn={identity.signedIn}>
      <Kanban columns={columns} me={me} signedIn={identity.signedIn} query={view.toString()} />
    </FilterBar>
  );
}
