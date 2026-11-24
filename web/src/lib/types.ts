// Mirrors api/app/models.py (the /v1 contract).

export type Status = "under_review" | "planned" | "in_progress" | "done" | "declined" | "merged";
export type SettableStatus = Exclude<Status, "merged">;
export type Category = "feature" | "bug" | "improvement";
export type Sort = "top" | "new" | "trending" | "updated";
export type Role = "member" | "admin";

export interface Author {
  id: string;
  display_name: string;
  is_team: boolean;
}

export interface PostRef {
  id: string;
  number: number;
  title: string;
}

export interface Post {
  id: string;
  number: number;
  title: string;
  body: string;
  category: Category;
  status: Status;
  pinned: boolean;
  vote_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  author: Author | null;
  merged_into: PostRef | null;
  has_voted: boolean;
  can_edit: boolean;
}

export interface PostList {
  items: Post[];
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

export interface VoteResult {
  post_id: string;
  voted: boolean;
  vote_count: number;
}

export interface Comment {
  type: "comment";
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: Author | null;
  can_delete: boolean;
}

export interface PostEvent {
  type: "event";
  id: string;
  post_id: string;
  kind: "status_changed" | "merged_from" | "merged_into" | "pinned" | "unpinned";
  from_status: Status | null;
  to_status: Status | null;
  related: PostRef | null;
  actor: Author | null;
  created_at: string;
}

export type ActivityItem = Comment | PostEvent;

export interface Activity {
  items: ActivityItem[];
}

export interface Me {
  id: string;
  display_name: string;
  role: Role;
}

export interface RoadmapItem {
  id: string;
  number: number;
  title: string;
  category: Category;
  status: Status;
  vote_count: number;
  comment_count: number;
}

export interface Roadmap {
  planned: RoadmapItem[];
  in_progress: RoadmapItem[];
  done: RoadmapItem[];
}

export interface Stats {
  total_posts: number;
  total_votes: number;
  total_comments: number;
  new_posts_week: number;
  votes_week: number;
  status_breakdown: Partial<Record<Status, number>>;
  top_posts: RoadmapItem[];
  posts_per_week: { week_start: string; count: number }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) return new ApiError(res.status, body.error.code, body.error.message);
  } catch {
    // not JSON
  }
  return new ApiError(res.status, "http_error", `Request failed (${res.status}).`);
}
