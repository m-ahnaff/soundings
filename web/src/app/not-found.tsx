import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-4 py-10 sm:px-8">
      <div className="max-w-lg rounded-[3px] border border-line px-5 py-5">
        <h1 className="text-[20px] font-medium">We can&rsquo;t find that request</h1>
        <p className="mt-2 text-[14px] text-fg-subtle">
          It may have been deleted, or the link is mistyped. Merged requests still open and point to the
          original.
        </p>
        <Link
          href="/requests"
          className="mt-4 inline-flex h-8 items-center rounded-[3px] bg-primary px-3 text-[14px] font-medium text-on-primary hover:bg-primary-hover"
        >
          Browse all requests
        </Link>
      </div>
    </div>
  );
}
