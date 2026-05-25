import { ulid } from "ulid";
import { and, eq } from "drizzle-orm";
import {
  invites,
  memberships,
  pageShares,
  pages,
  publishedPages,
  tesseraIdentities,
  uploads,
  users,
  workspaces,
  workspaceSites,
} from "@/worker/db/d1/schema";
import { getDb } from "@tests/worker/helpers/db";
import { TEST_TIMESTAMP } from "@tests/worker/helpers/fixtures";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
}

export interface SeedUserOptions {
  id?: string;
  email?: string;
  name?: string;
  avatar_url?: string | null;
}

export async function seedUser(opts: SeedUserOptions = {}): Promise<SeedUser> {
  const id = opts.id ?? `user_${ulid()}`;
  const email = opts.email ?? `${id}@example.com`;
  const name = opts.name ?? "Test User";

  await getDb()
    .insert(users)
    .values({
      id,
      email,
      name,
      avatar_url: opts.avatar_url ?? null,
      created_at: TEST_TIMESTAMP,
      updated_at: TEST_TIMESTAMP,
    });

  return { id, email, name };
}

export interface SeedTesseraIdentityOptions {
  sub: string;
  user_id: string;
  created_at?: string;
  last_seen_at?: string | null;
}

export async function seedTesseraIdentity(
  opts: SeedTesseraIdentityOptions,
): Promise<typeof tesseraIdentities.$inferSelect> {
  const row: typeof tesseraIdentities.$inferSelect = {
    sub: opts.sub,
    user_id: opts.user_id,
    created_at: opts.created_at ?? TEST_TIMESTAMP,
    last_seen_at: opts.last_seen_at ?? null,
  };
  await getDb().insert(tesseraIdentities).values(row);
  return row;
}

export interface SeedWorkspace {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
}

export interface SeedWorkspaceOptions {
  id?: string;
  slug?: string;
  name?: string;
  owner_id: string;
  icon?: string | null;
  seedOwnerMembership?: boolean;
}

export async function seedWorkspace(opts: SeedWorkspaceOptions): Promise<SeedWorkspace> {
  const id = opts.id ?? `ws_${ulid()}`;
  const slug = opts.slug ?? id.toLowerCase();
  const name = opts.name ?? "Test Workspace";

  await getDb()
    .insert(workspaces)
    .values({
      id,
      slug,
      name,
      icon: opts.icon ?? null,
      owner_id: opts.owner_id,
      created_at: TEST_TIMESTAMP,
    });

  if (opts.seedOwnerMembership !== false) {
    await seedMembership({ user_id: opts.owner_id, workspace_id: id, role: "owner" });
  }

  return { id, slug, name, owner_id: opts.owner_id };
}

export interface SeedMembershipOptions {
  user_id: string;
  workspace_id: string;
  role: typeof memberships.$inferSelect.role;
  joined_at?: string;
}

export async function seedMembership(opts: SeedMembershipOptions): Promise<typeof memberships.$inferSelect> {
  const row = {
    user_id: opts.user_id,
    workspace_id: opts.workspace_id,
    role: opts.role,
    joined_at: opts.joined_at ?? TEST_TIMESTAMP,
  };
  await getDb().insert(memberships).values(row);
  return row;
}

export interface SeedPageOptions {
  id?: string;
  workspace_id: string;
  created_by: string;
  parent_id?: string | null;
  kind?: "doc" | "canvas";
  title?: string;
  icon?: string | null;
  cover_url?: string | null;
  position?: number;
  archived_at?: string | null;
  archive_root_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function seedPage(opts: SeedPageOptions): Promise<typeof pages.$inferSelect> {
  // ULID (26 chars) fits the PresignRequest page_id.max(26) contract without prefix.
  const id = opts.id ?? ulid();
  const row: typeof pages.$inferSelect = {
    id,
    workspace_id: opts.workspace_id,
    parent_id: opts.parent_id ?? null,
    kind: opts.kind ?? "doc",
    title: opts.title ?? "Test Page",
    icon: opts.icon ?? null,
    cover_url: opts.cover_url ?? null,
    position: opts.position ?? 1,
    created_by: opts.created_by,
    created_at: opts.created_at ?? TEST_TIMESTAMP,
    updated_at: opts.updated_at ?? TEST_TIMESTAMP,
    archived_at: opts.archived_at ?? null,
    archive_root_id: opts.archive_root_id ?? null,
  };
  await getDb().insert(pages).values(row);
  return row;
}

export interface SeedPageShareOptions {
  id?: string;
  page_id: string;
  created_by: string;
  permission: "view" | "edit";
  grantee_type: "user" | "link";
  grantee_id?: string | null;
  link_token?: string | null;
}

export async function seedPageShare(opts: SeedPageShareOptions): Promise<typeof pageShares.$inferSelect> {
  const row: typeof pageShares.$inferSelect = {
    id: opts.id ?? `share_${ulid()}`,
    page_id: opts.page_id,
    grantee_type: opts.grantee_type,
    grantee_id: opts.grantee_id ?? null,
    permission: opts.permission,
    link_token: opts.link_token ?? null,
    created_by: opts.created_by,
    created_at: TEST_TIMESTAMP,
  };
  await getDb().insert(pageShares).values(row);
  return row;
}

export interface SeedWorkspaceSiteOptions {
  workspace_id: string;
  slug?: string;
  home_page_id?: string | null;
  published?: boolean;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function seedWorkspaceSite(opts: SeedWorkspaceSiteOptions): Promise<typeof workspaceSites.$inferSelect> {
  const createdAt = opts.created_at ?? TEST_TIMESTAMP;
  const publishedAt =
    typeof opts.published_at === "undefined" ? (opts.published === false ? null : createdAt) : opts.published_at;
  const row: typeof workspaceSites.$inferSelect = {
    workspace_id: opts.workspace_id,
    slug: opts.slug ?? "acme",
    home_page_id: opts.home_page_id ?? null,
    published_at: publishedAt,
    created_at: createdAt,
    updated_at: opts.updated_at ?? createdAt,
  };

  await getDb().insert(workspaceSites).values(row);
  return row;
}

export interface SeedPublishedPageOptions {
  workspace_id: string;
  page_id: string;
  published_by: string;
  published_at?: string;
}

export async function seedPublishedPage(opts: SeedPublishedPageOptions): Promise<typeof publishedPages.$inferSelect> {
  const row: typeof publishedPages.$inferSelect = {
    workspace_id: opts.workspace_id,
    page_id: opts.page_id,
    published_by: opts.published_by,
    published_at: opts.published_at ?? TEST_TIMESTAMP,
  };

  await getDb().insert(publishedPages).values(row).onConflictDoNothing();
  return row;
}

export async function deletePublishedPage(workspaceId: string, pageId: string): Promise<void> {
  await getDb()
    .delete(publishedPages)
    .where(and(eq(publishedPages.workspace_id, workspaceId), eq(publishedPages.page_id, pageId)));
}

export interface SeedInviteOptions {
  id?: string;
  workspace_id: string;
  invited_by: string;
  role?: "admin" | "member" | "guest";
  email?: string | null;
  token?: string;
  expires_at?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  revoked_at?: string | null;
}

export async function seedInvite(opts: SeedInviteOptions): Promise<typeof invites.$inferSelect> {
  const row: typeof invites.$inferSelect = {
    id: opts.id ?? `invite_${ulid()}`,
    email: opts.email ?? null,
    workspace_id: opts.workspace_id,
    invited_by: opts.invited_by,
    role: opts.role ?? "member",
    token: opts.token ?? `inv_${ulid()}`,
    accepted_at: opts.accepted_at ?? null,
    accepted_by: opts.accepted_by ?? null,
    revoked_at: opts.revoked_at ?? null,
    expires_at: opts.expires_at ?? "2099-01-01T00:00:00.000Z",
    created_at: TEST_TIMESTAMP,
  };
  await getDb().insert(invites).values(row);
  return row;
}

export interface SeedUploadOptions {
  id?: string;
  workspace_id: string;
  uploaded_by: string;
  page_id?: string | null;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  r2_key?: string;
}

export async function seedUpload(opts: SeedUploadOptions): Promise<typeof uploads.$inferSelect> {
  const row: typeof uploads.$inferSelect = {
    id: opts.id ?? `upload_${ulid()}`,
    workspace_id: opts.workspace_id,
    page_id: opts.page_id ?? null,
    uploaded_by: opts.uploaded_by,
    filename: opts.filename ?? "test.png",
    content_type: opts.content_type ?? "image/png",
    size_bytes: opts.size_bytes ?? 128,
    r2_key: opts.r2_key ?? `uploads/${opts.workspace_id}/${ulid()}.png`,
    created_at: TEST_TIMESTAMP,
  };
  await getDb().insert(uploads).values(row);
  return row;
}
