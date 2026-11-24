"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BOARD_NAME } from "@/lib/env";
import type { ActivityItem, Me, Post } from "@/lib/types";
import { issueKey } from "@/lib/format";
import { IssueView } from "@/components/issue/issue-view";

/** Full-page version of a request (its own URL). */
export function IssuePage({
  post,
  activity,
  me,
  signedIn,
}: {
  post: Post;
  activity: ActivityItem[];
  me: Me | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-[14px] text-fg-subtlest">
          <li>Projects</li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/" className="hover:text-fg hover:underline">
              {BOARD_NAME}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/requests" className="hover:text-fg hover:underline">
              All requests
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{issueKey(post.number)}</li>
        </ol>
      </nav>
      <div className="max-w-[1100px]">
        <IssueView
          key={`${post.id}:${post.updated_at}`}
          post={post}
          activity={activity}
          me={me}
          signedIn={signedIn}
          mode="page"
          onChanged={() => start(() => router.refresh())}
          onGone={(href) =>
            start(() => {
              router.push(href);
              router.refresh();
            })
          }
        />
      </div>
    </>
  );
}
