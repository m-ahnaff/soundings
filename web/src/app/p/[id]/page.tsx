import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { issueKey } from "@/lib/format";
import { IssuePage } from "@/components/issue/issue-page";
import { IssueSkeleton } from "@/components/skeletons";
import { apiGet, getIdentity, getMe } from "@/lib/api-server";
import { API_URL } from "@/lib/env";
import type { Activity, Post } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Request not found" };
  // Anonymous read: the title is public and this keeps metadata off the user's session.
  const res = await fetch(`${API_URL}/v1/posts/${id}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return { title: "Request not found" };
  const post = (await res.json()) as Post;
  return {
    title: `${issueKey(post.number)} ${post.title}`,
    description: post.body.slice(0, 160) || undefined,
  };
}

export default function Page({ params }: PageProps<"/p/[id]">) {
  return (
    <div className="px-4 pt-5 pb-10 sm:px-8">
      <Suspense fallback={<IssueSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [post, activity, me, identity] = await Promise.all([
    apiGet<Post>(`/v1/posts/${id}`),
    apiGet<Activity>(`/v1/posts/${id}/activity`),
    getMe(),
    getIdentity(),
  ]);
  if (!post) notFound();
  return <IssuePage post={post} activity={activity?.items ?? []} me={me} signedIn={identity.signedIn} />;
}
