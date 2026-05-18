import { sql } from "drizzle-orm";

import type { Db } from "@/worker/db/d1/client";
import { MAX_TREE_DEPTH } from "@/shared/constants";
import type { PageKind } from "@/shared/types";

const RESOLVE_MENTIONS_BATCH_SIZE = 90;

// Local D1/SQLite planner note:
// The recursive ancestor CTE is bounded by MAX_TREE_DEPTH, while
// published_pages can grow with every published root in a workspace. A normal
// JOIN let SQLite reorder the join and search published_pages by workspace_id
// only, then build an automatic index over the tiny CTE. CROSS JOIN keeps the
// bounded CTE as the outer loop so EXPLAIN QUERY PLAN shows published_pages
// probed by its composite primary key: workspace_id=? AND page_id=?.

export interface PagePublishStatus {
  page: { id: string; kind: PageKind; title: string; archived_at: string | null } | null;
  is_explicit_root: boolean;
  inherited_from: { id: string; title: string; icon: string | null } | null;
}

/**
 * Resolve publication status for a single page, walking unarchived ancestors
 * looking for the nearest `published_pages` row. Used by the site-status
 * endpoint.
 *
 * - `is_explicit_root` is true iff there is a direct row in `published_pages`
 *   for this page in this workspace.
 * - `inherited_from` is the nearest unarchived ancestor that is an explicit
 *   publish root. It is independent of `is_explicit_root` (a page can be both
 *   a direct root AND inherit from an ancestor; the response surfaces both).
 * - An archived ancestor between the page and a published ancestor breaks
 *   the chain because the CTE filters `archived_at IS NULL` at every step.
 */
export async function resolvePagePublishStatus(
  db: Db,
  workspaceId: string,
  pageId: string,
): Promise<PagePublishStatus> {
  const pageRow = await db.all<{ id: string; kind: PageKind; title: string; archived_at: string | null }>(sql`
    SELECT id, kind, title, archived_at
    FROM pages
    WHERE id = ${pageId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `);
  const page = pageRow[0] ?? null;
  if (!page) {
    return { page: null, is_explicit_root: false, inherited_from: null };
  }

  const rows = await db.all<{ page_id: string; title: string; icon: string | null; depth: number }>(sql`
    WITH RECURSIVE
    ancestors(id, parent_id, title, icon, depth) AS (
      SELECT p.id, p.parent_id, p.title, p.icon, 0
      FROM pages p
      WHERE p.id = ${pageId}
        AND p.workspace_id = ${workspaceId}
        AND p.archived_at IS NULL

      UNION ALL

      SELECT p.id, p.parent_id, p.title, p.icon, a.depth + 1
      FROM pages p
      JOIN ancestors a ON p.id = a.parent_id
      WHERE p.workspace_id = ${workspaceId}
        AND p.archived_at IS NULL
        AND a.depth < ${MAX_TREE_DEPTH - 1}
    )
    SELECT a.id AS page_id, a.title, a.icon, a.depth
    FROM ancestors a
    CROSS JOIN published_pages pp
    WHERE pp.workspace_id = ${workspaceId}
      AND pp.page_id = a.id
    ORDER BY a.depth ASC
    LIMIT 2
  `);

  const direct = rows.find((r) => r.depth === 0);
  const ancestor = rows.find((r) => r.depth > 0);

  return {
    page,
    is_explicit_root: Boolean(direct),
    inherited_from: ancestor ? { id: ancestor.page_id, title: ancestor.title, icon: ancestor.icon } : null,
  };
}

export interface ResolvedSite {
  workspace_id: string;
  slug: string;
  home_page_id: string | null;
  published_at: string;
  updated_at: string;
  workspace_name: string;
  workspace_icon: string | null;
}

export interface ResolvedPublishedPage {
  id: string;
  workspace_id: string;
  kind: PageKind;
  title: string;
  icon: string | null;
  cover_url: string | null;
  updated_at: string;
  // Nearest ancestor with a published_pages row, or the page itself if it is
  // an explicit root.
  published_root_id: string;
}

export interface ResolvedPublishedSitePage {
  site: ResolvedSite;
  page: ResolvedPublishedPage | null;
}

/**
 * Resolve a published site and requested public page in one D1 query.
 *
 * Returns null only when the published site itself is missing. Page failures
 * stay collapsed to `page: null` so callers can render the same site-branded
 * 404 for missing, archived, non-doc, cross-workspace, or unpublished targets.
 */
export async function resolvePublishedSitePage(
  db: Db,
  slug: string,
  requestedPath: string,
  requestedPageId: string | null,
): Promise<ResolvedPublishedSitePage | null> {
  const rows = await db.all<{
    workspace_id: string;
    slug: string;
    home_page_id: string | null;
    published_at: string;
    updated_at: string;
    workspace_name: string;
    workspace_icon: string | null;
    page_id: string | null;
    page_workspace_id: string | null;
    page_kind: PageKind | null;
    page_title: string | null;
    page_icon: string | null;
    page_cover_url: string | null;
    page_updated_at: string | null;
    published_root_id: string | null;
  }>(sql`
    WITH RECURSIVE
    site AS (
      SELECT
        ws.workspace_id,
        ws.slug,
        ws.home_page_id,
        ws.published_at,
        ws.updated_at,
        w.name AS workspace_name,
        w.icon AS workspace_icon
      FROM workspace_sites ws
      JOIN workspaces w ON w.id = ws.workspace_id
      WHERE ws.slug = ${slug}
        AND ws.published_at IS NOT NULL
      LIMIT 1
    ),
    target AS (
      SELECT
        site.workspace_id,
        CASE WHEN ${requestedPath} = '/' THEN site.home_page_id ELSE ${requestedPageId} END AS page_id
      FROM site
    ),
    ancestors(workspace_id, root_id, id, parent_id, depth) AS (
      SELECT t.workspace_id, p.id, p.id, p.parent_id, 0
      FROM target t
      JOIN pages p ON p.id = t.page_id
      WHERE p.workspace_id = t.workspace_id
        AND p.archived_at IS NULL

      UNION ALL

      SELECT a.workspace_id, a.root_id, p.id, p.parent_id, a.depth + 1
      FROM pages p
      JOIN ancestors a ON p.id = a.parent_id
      WHERE p.workspace_id = a.workspace_id
        AND p.archived_at IS NULL
        AND a.depth < ${MAX_TREE_DEPTH - 1}
    ),
    nearest_published AS (
      SELECT a.root_id, a.id AS published_root_id, a.depth
      FROM ancestors a
      CROSS JOIN published_pages pp
      WHERE pp.workspace_id = a.workspace_id
        AND pp.page_id = a.id
      ORDER BY a.depth ASC
      LIMIT 1
    )
    SELECT
      site.workspace_id,
      site.slug,
      site.home_page_id,
      site.published_at,
      site.updated_at,
      site.workspace_name,
      site.workspace_icon,
      p.id AS page_id,
      p.workspace_id AS page_workspace_id,
      p.kind AS page_kind,
      p.title AS page_title,
      p.icon AS page_icon,
      p.cover_url AS page_cover_url,
      p.updated_at AS page_updated_at,
      np.published_root_id
    FROM site
    LEFT JOIN target t ON t.workspace_id = site.workspace_id
    LEFT JOIN nearest_published np ON np.root_id = t.page_id
    LEFT JOIN pages p
      ON p.id = t.page_id
      AND p.workspace_id = site.workspace_id
      AND p.archived_at IS NULL
      AND p.kind = 'doc'
      AND np.root_id = p.id
    LIMIT 1
  `);

  const row = rows[0];
  if (!row) return null;

  const site: ResolvedSite = {
    workspace_id: row.workspace_id,
    slug: row.slug,
    home_page_id: row.home_page_id,
    published_at: row.published_at,
    updated_at: row.updated_at,
    workspace_name: row.workspace_name,
    workspace_icon: row.workspace_icon,
  };

  const page: ResolvedPublishedPage | null =
    row.page_id === null
      ? null
      : {
          id: row.page_id,
          workspace_id: row.page_workspace_id!,
          kind: row.page_kind!,
          title: row.page_title!,
          icon: row.page_icon,
          cover_url: row.page_cover_url,
          updated_at: row.page_updated_at!,
          published_root_id: row.published_root_id!,
        };

  return { site, page };
}

export interface ResolvedMention {
  pageId: string;
  reachable: boolean;
  title: string | null;
  icon: string | null;
}

/**
 * Batch-resolve mention pageIds against the published set for a single site.
 * Mention pageIds that are missing, archived, in another workspace, canvas, or
 * not reachable from a published root all collapse to `reachable: false` so
 * the renderer can redact the pageId attr before emitting HTML.
 */
export async function resolvePublishedMentions(
  db: Db,
  workspaceId: string,
  pageIds: string[],
): Promise<Map<string, ResolvedMention>> {
  const unique = [...new Set(pageIds)].filter((p) => p.length > 0);
  const result = new Map<string, ResolvedMention>();
  for (const id of unique) {
    result.set(id, { pageId: id, reachable: false, title: null, icon: null });
  }
  if (unique.length === 0) return result;

  for (let i = 0; i < unique.length; i += RESOLVE_MENTIONS_BATCH_SIZE) {
    const rows = await resolvePublishedMentionBatch(db, workspaceId, unique.slice(i, i + RESOLVE_MENTIONS_BATCH_SIZE));
    for (const row of rows) {
      result.set(row.page_id, {
        pageId: row.page_id,
        reachable: true,
        title: row.title,
        icon: row.icon,
      });
    }
  }

  return result;
}

async function resolvePublishedMentionBatch(
  db: Db,
  workspaceId: string,
  pageIds: string[],
): Promise<Array<{ page_id: string; title: string; icon: string | null }>> {
  const values = sql.join(
    pageIds.map((id) => sql`(${id})`),
    sql`, `,
  );

  return db.all<{ page_id: string; title: string; icon: string | null }>(sql`
    WITH RECURSIVE
    requested(root_id) AS (VALUES ${values}),
    ancestors(root_id, id, parent_id, depth) AS (
      SELECT r.root_id, p.id, p.parent_id, 0
      FROM requested r
      JOIN pages p ON p.id = r.root_id
      WHERE p.workspace_id = ${workspaceId}
        AND p.archived_at IS NULL
        AND p.kind = 'doc'

      UNION ALL

      SELECT a.root_id, p.id, p.parent_id, a.depth + 1
      FROM pages p
      JOIN ancestors a ON p.id = a.parent_id
      WHERE p.workspace_id = ${workspaceId}
        AND p.archived_at IS NULL
        AND a.depth < ${MAX_TREE_DEPTH - 1}
    ),
    reachable AS (
      SELECT DISTINCT a.root_id
      FROM ancestors a
      CROSS JOIN published_pages pp
      WHERE pp.workspace_id = ${workspaceId}
        AND pp.page_id = a.id
    )
    SELECT p.id AS page_id, p.title, p.icon
    FROM reachable r
    JOIN pages p ON p.id = r.root_id
    WHERE p.workspace_id = ${workspaceId}
      AND p.archived_at IS NULL
  `);
}

export function isSitesFeatureEnabled(env: Pick<Env, "PUBLISHED_SITE_DOMAIN">): boolean {
  return Boolean(env.PUBLISHED_SITE_DOMAIN?.trim());
}

export function getSitesBaseDomain(env: Pick<Env, "PUBLISHED_SITE_DOMAIN">): string | null {
  const v = env.PUBLISHED_SITE_DOMAIN?.trim();
  return v ? v : null;
}
