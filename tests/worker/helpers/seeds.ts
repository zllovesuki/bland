import { ulid } from "ulid";
import { hashPassword } from "@/worker/lib/auth";
import { invites, memberships, pageShares, pages, uploads, users, workspaces } from "@/worker/db/d1/schema";
import { getDb } from "@tests/worker/helpers/db";
import { TEST_TIMESTAMP } from "@tests/worker/helpers/fixtures";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

export interface SeedUserOptions {
  id?: string;
  email?: string;
  name?: string;
  /**
   * When provided, the user is seeded with a real argon2id hash of this value.
   * Omit to store a deterministic placeholder — faster, and adequate for tests
   * that authenticate via JWT rather than password login.
   */
  password?: string;
  avatar_url?: string | null;
}

const UNUSED_PASSWORD_PLACEHOLDER = "$argon2id$test-placeholder-not-verifiable";

export async function seedUser(opts: SeedUserOptions = {}): Promise<SeedUser> {
  const id = opts.id ?? `user_${ulid()}`;
  const email = opts.email ?? `${id}@example.com`;
  const name = opts.name ?? "Test User";
  const password = opts.password ?? "";
  const password_hash = password ? hashPassword(password) : UNUSED_PASSWORD_PLACEHOLDER;

  await getDb()
    .insert(users)
    .values({
      id,
      email,
      password_hash,
      name,
      avatar_url: opts.avatar_url ?? null,
      created_at: TEST_TIMESTAMP,
      updated_at: TEST_TIMESTAMP,
    });

  return { id, email, name, password };
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
