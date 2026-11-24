/** Skeletons mirror the real layout box-for-box so nothing jumps when data lands. */

export function BoardSkeleton() {
  return (
    <div className="overflow-hidden px-4 sm:px-8" aria-busy="true">
      <div className="flex gap-2" aria-hidden="true">
        {[4, 3, 2, 4, 1].map((n, c) => (
          <div key={c} className="w-[272px] shrink-0 rounded-[3px] bg-sunken p-1.5">
            <div className="skeleton m-1.5 mb-3 h-3 w-24" />
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="mb-1.5 rounded-[3px] border border-line bg-bg p-2.5">
                <div className="skeleton h-3.5 w-[90%]" />
                <div className="skeleton mt-1.5 h-3.5 w-[60%]" />
                <div className="mt-3 flex items-center gap-2">
                  <div className="skeleton size-4" />
                  <div className="skeleton h-3 w-12" />
                  <div className="skeleton ml-auto size-[22px] rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading board…</span>
    </div>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="px-4 sm:px-8" aria-busy="true">
      <div className="rounded-[3px] border border-line" aria-hidden="true">
        <div className="h-9 border-b-2 border-line" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[37px] items-center gap-3 border-b border-line px-3 last:border-b-0">
            <div className="skeleton size-4" />
            <div className="skeleton h-3 w-12" />
            <div className="skeleton h-3" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
            <div className="skeleton ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading requests…</span>
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-8" aria-hidden="true">
      <div className="skeleton h-8 w-full sm:w-60" />
      <div className="skeleton h-8 w-32" />
      <div className="skeleton h-8 w-28" />
    </div>
  );
}

export function IssueSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-3 h-7 w-3/4" />
      <div className="skeleton mt-4 h-8 w-44" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-[90%]" />
          <div className="skeleton h-4 w-[70%]" />
        </div>
        <div className="skeleton h-56" />
      </div>
      <span className="sr-only">Loading request…</span>
    </div>
  );
}

export function GadgetsSkeleton() {
  return (
    <div className="grid gap-4 px-4 pb-8 sm:px-8 lg:grid-cols-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-64 rounded-[3px] border border-line" aria-hidden="true">
          <div className="h-10 border-b border-line" />
          <div className="skeleton m-4 h-40" />
        </div>
      ))}
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
