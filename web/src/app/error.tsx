"use client";

import Link from "next/link";
import { API_URL, IS_DEMO } from "@/lib/env";
import { btn } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-4 py-10 sm:px-8">
      <div className="max-w-lg rounded-[3px] border border-line px-5 py-5">
        <h1 className="text-[20px] font-medium">Something went wrong loading this page</h1>
        <p className="mt-2 text-[14px] text-fg-subtle">
          The feedback service didn&rsquo;t respond as expected. This is usually temporary.
          {IS_DEMO && (
            <>
              {" "}
              In local demo mode, check that the API is running at{" "}
              <code className="font-mono">{API_URL}</code>.
            </>
          )}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[12px] text-fg-subtlest">Reference: {error.digest}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className={btn.primary}>
            Try again
          </button>
          <Link href="/" className={btn.subtle}>
            Go to the board
          </Link>
        </div>
      </div>
    </div>
  );
}
