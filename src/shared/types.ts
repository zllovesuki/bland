import { z } from "zod";
import { ALLOWED_UPLOAD_TYPES, MAX_PAGE_MENTION_BATCH, MAX_UPLOAD_SIZE } from "@/shared/constants";
import { AiUsage } from "@/shared/ai";

export const WorkspaceRole = z.enum(["owner", "admin", "member", "guest"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRole>;

export const SharePermission = z.enum(["view", "edit"]);
export type SharePermission = z.infer<typeof SharePermission>;

export const GranteeType = z.enum(["user", "link"]);
export type GranteeType = z.infer<typeof GranteeType>;

export const InviteRole = z.enum(["admin", "member", "guest"]);
export type InviteRole = z.infer<typeof InviteRole>;

export const PageKind = z.enum(["doc", "canvas"]);
export type PageKind = z.infer<typeof PageKind>;

export const User = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
});
export type User = z.infer<typeof User>;

export const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().nullable(),
  owner_id: z.string(),
  created_at: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

// Workspace + caller's role. Returned by `GET /workspaces` so both the worker
// and the client can answer "which of my workspaces are writer-eligible?"
// without a second round-trip through /members.
export const WorkspaceMembershipSummary = Workspace.extend({
  role: WorkspaceRole,
});
export type WorkspaceMembershipSummary = z.infer<typeof WorkspaceMembershipSummary>;

export const WorkspaceMember = z.object({
  user_id: z.string(),
  workspace_id: z.string(),
  role: WorkspaceRole,
  joined_at: z.string(),
  user: User.optional(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMember>;

export const Page = z.object({
  id: z.string(),
  workspace_id: z.string(),
  parent_id: z.string().nullable(),
  kind: PageKind,
  title: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
  position: z.number(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});
export type Page = z.infer<typeof Page>;

export const GranteeUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export type GranteeUser = z.infer<typeof GranteeUser>;

export const PageShare = z.object({
  id: z.string(),
  page_id: z.string(),
  grantee_type: GranteeType,
  grantee_id: z.string().nullable(),
  permission: SharePermission,
  link_token: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  grantee_user: GranteeUser.nullable().optional(),
});
export type PageShare = z.infer<typeof PageShare>;

export const Invite = z.object({
  id: z.string(),
  email: z.string().nullable(),
  workspace_id: z.string(),
  invited_by: z.string(),
  role: InviteRole,
  token: z.string(),
  accepted_at: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
});
export type Invite = z.infer<typeof Invite>;

export const LoginRequest = z.object({
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const CreateAccountRequest = z.object({
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  turnstileToken: z.string().min(1),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequest>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

export const PublicClientConfig = z.object({
  turnstile_site_key: z.string().min(1),
  sentry_dsn: z.string().min(1).nullable(),
});
export type PublicClientConfig = z.infer<typeof PublicClientConfig>;

export const InvitePreview = z.object({
  id: z.string(),
  email: z.string().nullable(),
  role: InviteRole,
  workspace_name: z.string(),
  workspace_icon: z.string().nullable(),
  invited_by_name: z.string(),
});
export type InvitePreview = z.infer<typeof InvitePreview>;

export const CreateInviteRequest = z.object({
  email: z.email().max(255).optional(),
  role: InviteRole.default("member"),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

export const AcceptInviteRequest = z.object({
  turnstileToken: z.string().min(1),
  email: z.email().max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  name: z.string().min(1).max(100).optional(),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

// Reserved slugs that conflict with frontend routes
const RESERVED_SLUGS = new Set([
  "s",
  "login",
  "invite",
  "profile",
  "shared-with-me",
  "api",
  "uploads",
  "ws",
  "parties",
]);

const workspaceSlug = z
  .string()
  .min(1)
  .max(60)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Slug must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen",
  )
  .refine((s) => !RESERVED_SLUGS.has(s), "This slug is reserved");

export const CreateWorkspaceRequest = z.object({
  name: z.string().min(1).max(100),
  slug: workspaceSlug,
  icon: z.string().max(50).optional(),
});
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequest>;

export const UpdateWorkspaceRequest = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: workspaceSlug.optional(),
  icon: z.string().max(50).nullable().optional(),
});
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequest>;

export const UpdateMemberRoleRequest = z.object({
  role: InviteRole,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequest>;

export const CreatePageRequest = z.object({
  kind: PageKind.default("doc"),
  title: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  parent_id: z.string().max(26).optional().nullable(),
  position: z.number().optional(),
});
export type CreatePageRequest = z.infer<typeof CreatePageRequest>;

export const UpdatePageRequest = z.object({
  icon: z.string().max(50).nullable().optional(),
  cover_url: z.string().max(2048).nullable().optional(),
  position: z.number().optional(),
  parent_id: z.string().max(26).nullable().optional(),
});
export type UpdatePageRequest = z.infer<typeof UpdatePageRequest>;

export const PresignRequest = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.enum(ALLOWED_UPLOAD_TYPES),
  size_bytes: z.number().int().min(1).max(MAX_UPLOAD_SIZE),
  page_id: z.string().max(26).nullable().optional(),
});
export type PresignRequest = z.infer<typeof PresignRequest>;

export const Upload = z.object({
  id: z.string(),
  workspace_id: z.string(),
  page_id: z.string().nullable(),
  uploaded_by: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  r2_key: z.string(),
  created_at: z.string(),
});
export type Upload = z.infer<typeof Upload>;

export const SearchResult = z.object({
  page_id: z.string(),
  title: z.string(),
  snippet: z.string(),
  icon: z.string().nullable(),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const CreateShareRequest = z.object({
  grantee_type: GranteeType,
  grantee_id: z.string().max(26).optional(),
  grantee_email: z.email().max(255).optional(),
  permission: SharePermission,
});
export type CreateShareRequest = z.infer<typeof CreateShareRequest>;

export const ResolvedViewerContext = z.object({
  // Membership axis: `member` iff the caller has a memberships row on the
  // canonical workspace surface (including guest). Non-member canonical access
  // and every `/s/:token` or `?share=` request emits `shared`.
  access_mode: z.enum(["member", "shared"]),
  principal_type: z.enum(["user", "link"]),
  route_kind: z.enum(["canonical", "shared"]),
  workspace_slug: z.string().nullable(),
  // Role axis: the caller's workspace role when they have a membership row,
  // else null. Always null on the shared surface so `/s/:token` stays
  // link-scoped end to end regardless of a caller's membership status.
  workspace_role: WorkspaceRole.nullable(),
});
export type ResolvedViewerContext = z.infer<typeof ResolvedViewerContext>;

export const SharedPageInfo = z.object({
  page_id: z.string(),
  workspace_id: z.string(),
  kind: PageKind,
  title: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
  permission: SharePermission,
  token: z.string(),
  viewer: ResolvedViewerContext,
});
export type SharedPageInfo = z.infer<typeof SharedPageInfo>;

const avatarUrl = z
  .string()
  .max(2048)
  .refine((s) => s.startsWith("/uploads/") || s.startsWith("https://"), "Avatar must be an upload or HTTPS URL")
  .nullable()
  .optional();

export const UpdateProfileRequest = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar_url: avatarUrl,
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export const SharedWithMeItem = z.object({
  page_id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    icon: z.string().nullable(),
    role: WorkspaceRole.nullable(),
  }),
  permission: SharePermission,
  shared_by: z.string(),
  shared_by_name: z.string(),
  shared_at: z.string(),
});
export type SharedWithMeItem = z.infer<typeof SharedWithMeItem>;

/**
 * Grouped summary for pages shared with the current user *inside* a workspace
 * they are already a member of. Those pages are reachable in the workspace's
 * normal page tree, so we do not duplicate them as standalone items — we
 * surface a lightweight pointer so the user can jump to the workspace.
 */
export const SharedInboxWorkspaceSummary = z.object({
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    icon: z.string().nullable(),
  }),
  count: z.number().int().nonnegative(),
});
export type SharedInboxWorkspaceSummary = z.infer<typeof SharedInboxWorkspaceSummary>;

export const SharedPagesResponse = z.object({
  items: z.array(SharedWithMeItem),
  workspace_summaries: z.array(SharedInboxWorkspaceSummary),
});
export type SharedPagesResponse = z.infer<typeof SharedPagesResponse>;

export const GetPageResponse = z.object({
  page: Page,
  can_edit: z.boolean(),
});
export type GetPageResponse = z.infer<typeof GetPageResponse>;

export const PageAncestor = z.object({
  id: z.string(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  accessible: z.boolean(),
});
export type PageAncestor = z.infer<typeof PageAncestor>;

export const GetPageAncestorsResponse = z.object({
  ancestors: z.array(PageAncestor),
});
export type GetPageAncestorsResponse = z.infer<typeof GetPageAncestorsResponse>;

export const PageRouteBootstrapResponse = z.object({
  workspace: Workspace,
  viewer: ResolvedViewerContext,
});
export type PageRouteBootstrapResponse = z.infer<typeof PageRouteBootstrapResponse>;

export const ResolvePageMentionsRequest = z.object({
  page_ids: z.array(z.string().min(1)).min(1).max(MAX_PAGE_MENTION_BATCH),
});
export type ResolvePageMentionsRequest = z.infer<typeof ResolvePageMentionsRequest>;

export const ResolvedPageMentionItem = z.object({
  page_id: z.string(),
  accessible: z.boolean(),
  title: z.string().nullable(),
  icon: z.string().nullable(),
});
export type ResolvedPageMentionItem = z.infer<typeof ResolvedPageMentionItem>;

export const ResolvePageMentionsResponse = z.object({
  mentions: z.array(ResolvedPageMentionItem),
});
export type ResolvePageMentionsResponse = z.infer<typeof ResolvePageMentionsResponse>;

export type PageSnapshotResponse = { kind: "found"; snapshot: ArrayBuffer } | { kind: "missing" };

export const AiRewriteAction = z.enum(["proofread", "formal", "casual", "simplify", "expand"]);
export type AiRewriteAction = z.infer<typeof AiRewriteAction>;

const AI_BLOCK_MAX = 2000;
const AI_SELECTION_MAX = 4000;

export const AiRewriteRequest = z.object({
  action: AiRewriteAction,
  selectedText: z.string().min(1).max(AI_SELECTION_MAX),
  parentBlock: z.string().max(AI_BLOCK_MAX),
  beforeBlock: z.string().max(AI_BLOCK_MAX),
  afterBlock: z.string().max(AI_BLOCK_MAX),
  pageTitle: z.string().max(500),
});
export type AiRewriteRequest = z.infer<typeof AiRewriteRequest>;

export const AiGenerateIntent = z.enum(["continue", "explain", "brainstorm"]);
export type AiGenerateIntent = z.infer<typeof AiGenerateIntent>;

export const AiGenerateRequest = z.object({
  intent: AiGenerateIntent,
  beforeBlock: z.string().max(AI_BLOCK_MAX),
  afterBlock: z.string().max(AI_BLOCK_MAX),
  pageTitle: z.string().max(500),
});
export type AiGenerateRequest = z.infer<typeof AiGenerateRequest>;

export const AiAskHistoryMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(AI_BLOCK_MAX),
});
export type AiAskHistoryMessage = z.infer<typeof AiAskHistoryMessage>;

export const AiAskRequest = z.object({
  question: z.string().min(1).max(AI_BLOCK_MAX),
  history: z.array(AiAskHistoryMessage).max(6).optional(),
});
export type AiAskRequest = z.infer<typeof AiAskRequest>;

export const AiSummarizeResponse = z.object({
  summary: z.string(),
  usage: AiUsage.optional(),
});
export type AiSummarizeResponse = z.infer<typeof AiSummarizeResponse>;
