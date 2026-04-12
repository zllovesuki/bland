import { z } from "zod";

export const WorkspaceRole = z.enum(["owner", "admin", "member", "guest"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRole>;

export const SharePermission = z.enum(["view", "edit"]);
export type SharePermission = z.infer<typeof SharePermission>;

export const GranteeType = z.enum(["user", "link"]);
export type GranteeType = z.infer<typeof GranteeType>;

export const InviteRole = z.enum(["admin", "member", "guest"]);
export type InviteRole = z.infer<typeof InviteRole>;

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
const RESERVED_SLUGS = new Set(["s", "login", "invite", "profile", "shared-with-me", "api", "uploads", "ws"]);

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

const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const UPLOAD_MIME_SET = new Set<string>(ALLOWED_UPLOAD_TYPES);
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

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
  access_mode: z.enum(["member", "shared"]),
  principal_type: z.enum(["user", "link"]),
  route_kind: z.enum(["canonical", "shared"]),
  workspace_slug: z.string().nullable(),
});
export type ResolvedViewerContext = z.infer<typeof ResolvedViewerContext>;

export const SharedPageInfo = z.object({
  page_id: z.string(),
  workspace_id: z.string(),
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

export interface PageWithAccess {
  page: Page;
  can_edit: boolean;
}

export interface AncestorInfo {
  id: string;
  title: string | null;
  icon: string | null;
  accessible: boolean;
}

export interface PageContext {
  workspace: Workspace;
  page: Page;
  can_edit: boolean;
  viewer: ResolvedViewerContext;
}
