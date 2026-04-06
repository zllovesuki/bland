import { sql, type SQL } from "drizzle-orm";
import { checkMembership } from "@/worker/lib/membership";
import type { Db } from "@/worker/db/client";

export function canEdit(role: string): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdminOrOwner(role: string): boolean {
  return role === "owner" || role === "admin";
}

export type ShareAction = "view" | "edit";
export type AccessLevel = "none" | "view" | "edit";

const MAX_PERMISSION_DEPTH = 10;
const FULL_WORKSPACE_ACCESS_LEVEL: AccessLevel = "edit";
const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
};

/**
 * Principal represents who is requesting access.
 * Either an authenticated user or a link share token.
 */
export type Principal = { type: "user"; userId: string } | { type: "link"; token: string };

/**
 * Resolve the effective access level for each requested page.
 *
 * Assumption: v1 has monotonic positive permissions only (`none` < `view` < `edit`).
 * There are no page-level deny rules, so resolving the strongest applicable grant once
 * is enough to answer both "can view?" and "can edit?" checks.
 */
export async function resolvePageAccessLevels(
  db: Db,
  principal: Principal,
  pageIds: string[],
  workspaceId: string,
): Promise<Map<string, AccessLevel>> {
  const uniquePageIds = [...new Set(pageIds)];
  const levels = new Map(uniquePageIds.map((pageId) => [pageId, "none" as AccessLevel]));

  if (uniquePageIds.length === 0) {
    return levels;
  }

  if (principal.type === "user") {
    // Assumption: in v1, workspace owner/admin/member always have full page access.
    // If page-level denies or weaker workspace roles are added later, update this
    // short-circuit together with the access-rank comparison helpers below.
    const membership = await checkMembership(db, principal.userId, workspaceId);
    if (membership && canEdit(membership.role)) {
      return new Map(uniquePageIds.map((pageId) => [pageId, FULL_WORKSPACE_ACCESS_LEVEL]));
    }
  }

  const resolved = await db.all<{ page_id: string; access_rank: number }>(
    buildBatchPageAccessQuery(uniquePageIds, principal, workspaceId),
  );

  for (const row of resolved) {
    levels.set(row.page_id, rankToAccessLevel(row.access_rank));
  }

  return levels;
}

/**
 * Resolve access for many pages at once.
 *
 * This intentionally wraps the richer access-level resolver instead of returning booleans
 * directly from SQL. Several callers need both view and edit answers for the same page,
 * and reusing the resolved level avoids paying for the tree walk twice.
 */
export async function canAccessPages(
  db: Db,
  principal: Principal,
  pageIds: string[],
  workspaceId: string,
  action: ShareAction,
): Promise<Map<string, boolean>> {
  const uniquePageIds = [...new Set(pageIds)];
  const allowed = new Map(uniquePageIds.map((pageId) => [pageId, false]));

  if (uniquePageIds.length === 0) {
    return allowed;
  }

  const levels = await resolvePageAccessLevels(db, principal, uniquePageIds, workspaceId);

  for (const pageId of uniquePageIds) {
    allowed.set(pageId, accessLevelSatisfies(levels.get(pageId) ?? "none", action));
  }

  return allowed;
}

/**
 * Resolve access for a single page.
 *
 * Implements spec §9 / §20.2:
 * 1. Workspace owner/admin/member → use role
 * 2. Walk page_shares up the tree (replace-not-merge)
 * 3. Deny if no shares found
 */
export async function canAccessPage(
  db: Db,
  principal: Principal,
  pageId: string,
  workspaceId: string,
  action: ShareAction,
): Promise<boolean> {
  const results = await canAccessPages(db, principal, [pageId], workspaceId, action);
  return results.get(pageId) ?? false;
}

function buildBatchPageAccessQuery(pageIds: string[], principal: Principal, workspaceId: string): SQL {
  const requestedValues = sql.join(
    pageIds.map((pageId) => sql`(${pageId})`),
    sql`, `,
  );

  const granteeId = principal.type === "user" ? principal.userId : null;
  const linkToken = principal.type === "link" ? principal.token : null;

  return sql`
    WITH RECURSIVE
    requested(root_id) AS (
      VALUES ${requestedValues}
    ),
    ancestors(root_id, id, parent_id, depth) AS (
      SELECT r.root_id, p.id, p.parent_id, 0
      FROM requested r
      JOIN pages p ON p.id = r.root_id
      WHERE p.workspace_id = ${workspaceId}

      UNION ALL

      SELECT a.root_id, p.id, p.parent_id, a.depth + 1
      FROM pages p
      JOIN ancestors a ON p.id = a.parent_id
      WHERE p.workspace_id = ${workspaceId}
        AND a.depth < ${MAX_PERMISSION_DEPTH - 1}
    ),
    nearest_shared_depth AS (
      SELECT a.root_id, MIN(a.depth) AS depth
      FROM ancestors a
      WHERE EXISTS (
        SELECT 1
        FROM page_shares s
        WHERE s.page_id = a.id
      )
      GROUP BY a.root_id
    ),
    nearest_shared AS (
      SELECT a.root_id, a.id AS shared_page_id
      FROM ancestors a
      JOIN nearest_shared_depth d
        ON d.root_id = a.root_id
       AND d.depth = a.depth
    )
    SELECT
      r.root_id AS page_id,
      -- Assumption: v1 share inheritance is replace-not-merge, so only the nearest
      -- shared ancestor can contribute grants for a requested page.
      --
      -- MAX() is defensive. The route layer prevents duplicate user shares, but the
      -- schema does not enforce one share row per principal/page pair yet.
      COALESCE(
        MAX(
          CASE s.permission
            WHEN 'edit' THEN ${ACCESS_RANK.edit}
            WHEN 'view' THEN ${ACCESS_RANK.view}
            ELSE ${ACCESS_RANK.none}
          END
        ),
        ${ACCESS_RANK.none}
      ) AS access_rank
    FROM requested r
    LEFT JOIN nearest_shared n ON n.root_id = r.root_id
    LEFT JOIN page_shares s
      ON s.page_id = n.shared_page_id
     AND (
       (s.grantee_type = 'user' AND s.grantee_id = ${granteeId}) OR
       (s.grantee_type = 'link' AND s.link_token = ${linkToken})
     )
    GROUP BY r.root_id
  `;
}

function accessLevelSatisfies(granted: AccessLevel, required: ShareAction): boolean {
  return ACCESS_RANK[granted] >= ACCESS_RANK[required];
}

function rankToAccessLevel(rank: number): AccessLevel {
  if (rank >= ACCESS_RANK.edit) return "edit";
  if (rank >= ACCESS_RANK.view) return "view";
  return "none";
}
