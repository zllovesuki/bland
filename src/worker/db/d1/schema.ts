import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  icon: text("icon"),
  owner_id: text("owner_id")
    .notNull()
    .references(() => users.id),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const memberships = sqliteTable(
  "memberships",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    role: text("role", { enum: ["owner", "admin", "member", "guest"] }).notNull(),
    joined_at: text("joined_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.workspace_id] })],
);

export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    invited_by: text("invited_by")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["admin", "member", "guest"] })
      .notNull()
      .default("member"),
    token: text("token").unique().notNull(),
    accepted_at: text("accepted_at"),
    accepted_by: text("accepted_by").references(() => users.id),
    revoked_at: text("revoked_at"),
    expires_at: text("expires_at").notNull(),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_invites_token").on(table.token), index("idx_invites_email").on(table.email)],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    // Self-referential FK requires `any` return — Drizzle limitation for circular table refs
    parent_id: text("parent_id").references((): any => pages.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: ["doc", "canvas"] })
      .notNull()
      .default("doc"),
    title: text("title").notNull().default("Untitled"),
    icon: text("icon"),
    cover_url: text("cover_url"),
    position: real("position").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    archived_at: text("archived_at"),
  },
  (table) => [
    index("idx_pages_parent").on(table.workspace_id, table.parent_id, table.position),
    index("idx_pages_workspace").on(table.workspace_id, table.archived_at),
  ],
);

export const pageShares = sqliteTable(
  "page_shares",
  {
    id: text("id").primaryKey(),
    page_id: text("page_id")
      .notNull()
      .references(() => pages.id),
    grantee_type: text("grantee_type", {
      enum: ["user", "link"],
    }).notNull(),
    grantee_id: text("grantee_id"),
    permission: text("permission", {
      enum: ["view", "edit"],
    }).notNull(),
    link_token: text("link_token").unique(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_page_shares_page").on(table.page_id),
    index("idx_page_shares_grantee").on(table.grantee_type, table.grantee_id),
  ],
);

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  workspace_id: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  page_id: text("page_id").references(() => pages.id),
  uploaded_by: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  filename: text("filename").notNull(),
  content_type: text("content_type").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  r2_key: text("r2_key").notNull(),
  created_at: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
