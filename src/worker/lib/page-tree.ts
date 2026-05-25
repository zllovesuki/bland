import { sql } from "drizzle-orm";

import { MAX_TREE_DEPTH } from "@/shared/constants";
import type { ArchivedPage } from "@/shared/types";
import type { Db } from "@/worker/db/d1/client";

export type PageAncestorRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  depth: number;
};

export type PageSubtreeRow = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  kind: "doc" | "canvas";
  title: string;
  icon: string | null;
  cover_url: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archive_root_id: string | null;
  depth: number;
};

export type ArchivedAncestorRow = {
  id: string;
  parent_id: string | null;
  archived_at: string;
  archive_root_id: string | null;
  depth: number;
};

export type PageMoveValidationResult = { ok: true } | { ok: false; reason: "self_parent" | "cycle" | "depth_exceeded" };

export async function getPageAncestorChain(db: Db, pageId: string, workspaceId: string): Promise<PageAncestorRow[]> {
  return db.all<PageAncestorRow>(sql`
    WITH RECURSIVE ancestors(id, parent_id, title, icon, depth) AS (
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
        AND a.depth < ${MAX_TREE_DEPTH}
    )
    SELECT id, parent_id, title, icon, depth
    FROM ancestors
    ORDER BY depth ASC
  `);
}

export function getPageAncestorDepthFromChain(
  chain: Pick<PageAncestorRow, "id" | "parent_id" | "depth">[],
): number | null {
  if (chain.length === 0) {
    return 0;
  }

  const visited = new Set<string>();
  for (const row of chain) {
    if (visited.has(row.id)) return null;
    visited.add(row.id);
  }

  const deepest = chain[chain.length - 1];
  if (deepest.depth >= MAX_TREE_DEPTH && deepest.parent_id !== null) {
    return null;
  }

  return deepest.depth;
}

export async function getPageSubtreeMaxDepth(db: Db, pageId: string, workspaceId: string): Promise<number> {
  const rows = await db.all<{ max_depth: number | null }>(sql`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT p.id, 0
      FROM pages p
      WHERE p.id = ${pageId}
        AND p.workspace_id = ${workspaceId}

      UNION ALL

      SELECT child.id, d.depth + 1
      FROM pages child
      JOIN descendants d ON child.parent_id = d.id
      WHERE child.workspace_id = ${workspaceId}
        AND d.depth < ${MAX_TREE_DEPTH - 1}
    )
    SELECT MAX(depth) AS max_depth
    FROM descendants
  `);

  return rows[0]?.max_depth ?? 0;
}

export async function getPageSubtreeRows(db: Db, pageId: string, workspaceId: string): Promise<PageSubtreeRow[]> {
  return db.all<PageSubtreeRow>(sql`
    WITH RECURSIVE descendants(
      id,
      workspace_id,
      parent_id,
      kind,
      title,
      icon,
      cover_url,
      position,
      created_by,
      created_at,
      updated_at,
      archived_at,
      archive_root_id,
      depth
    ) AS (
      SELECT
        p.id,
        p.workspace_id,
        p.parent_id,
        p.kind,
        p.title,
        p.icon,
        p.cover_url,
        p.position,
        p.created_by,
        p.created_at,
        p.updated_at,
        p.archived_at,
        p.archive_root_id,
        0
      FROM pages p
      WHERE p.id = ${pageId}
        AND p.workspace_id = ${workspaceId}

      UNION ALL

      SELECT
        child.id,
        child.workspace_id,
        child.parent_id,
        child.kind,
        child.title,
        child.icon,
        child.cover_url,
        child.position,
        child.created_by,
        child.created_at,
        child.updated_at,
        child.archived_at,
        child.archive_root_id,
        d.depth + 1
      FROM pages child
      JOIN descendants d ON child.parent_id = d.id
      WHERE child.workspace_id = ${workspaceId}
        AND d.depth < ${MAX_TREE_DEPTH - 1}
    )
    SELECT
      id,
      workspace_id,
      parent_id,
      kind,
      title,
      icon,
      cover_url,
      position,
      created_by,
      created_at,
      updated_at,
      archived_at,
      archive_root_id,
      depth
    FROM descendants
    ORDER BY depth ASC, position ASC, id ASC
  `);
}

export async function getArchivedPageRootRows(
  db: Db,
  workspaceId: string,
  options: { createdBy?: string } = {},
): Promise<ArchivedPage[]> {
  // Trash is currently unpaginated. The query is indexed by archived roots, but
  // add cursor pagination before this surface can return large trash histories.
  const createdByClause = options.createdBy === undefined ? sql.empty() : sql`AND p.created_by = ${options.createdBy}`;

  return db.all<ArchivedPage>(sql`
    SELECT
      p.id,
      p.workspace_id,
      p.parent_id,
      p.kind,
      p.title,
      p.icon,
      p.cover_url,
      p.position,
      p.created_by,
      p.created_at,
      p.updated_at,
      p.archived_at,
      p.archive_root_id,
      (
        SELECT COUNT(*)
        FROM pages child
        WHERE child.workspace_id = p.workspace_id
          AND child.archive_root_id = p.id
          AND child.id <> p.id
      ) AS archived_descendant_count
    FROM pages p
    WHERE p.workspace_id = ${workspaceId}
      ${createdByClause}
      AND p.archived_at IS NOT NULL
      AND p.archive_root_id = p.id
    ORDER BY p.archived_at DESC
  `);
}

export async function getArchivedAncestorRows(
  db: Db,
  pageId: string,
  workspaceId: string,
): Promise<ArchivedAncestorRow[]> {
  return db.all<ArchivedAncestorRow>(sql`
    WITH RECURSIVE ancestors(id, parent_id, archived_at, archive_root_id, depth) AS (
      SELECT parent.id, parent.parent_id, parent.archived_at, parent.archive_root_id, 0
      FROM pages child
      JOIN pages parent ON parent.id = child.parent_id
      WHERE child.id = ${pageId}
        AND child.workspace_id = ${workspaceId}
        AND parent.workspace_id = ${workspaceId}

      UNION ALL

      SELECT parent.id, parent.parent_id, parent.archived_at, parent.archive_root_id, a.depth + 1
      FROM pages parent
      JOIN ancestors a ON parent.id = a.parent_id
      WHERE parent.workspace_id = ${workspaceId}
        AND a.depth < ${MAX_TREE_DEPTH - 1}
    )
    SELECT id, parent_id, archived_at, archive_root_id, depth
    FROM ancestors
    WHERE archived_at IS NOT NULL
    ORDER BY depth ASC
  `);
}

export async function validatePageMove(
  db: Db,
  pageId: string,
  newParentId: string,
  workspaceId: string,
): Promise<PageMoveValidationResult> {
  if (newParentId === pageId) {
    return { ok: false, reason: "self_parent" };
  }

  const parentChain = await getPageAncestorChain(db, newParentId, workspaceId);
  if (parentChain.some((ancestor) => ancestor.id === pageId)) {
    return { ok: false, reason: "cycle" };
  }

  const parentDepth = getPageAncestorDepthFromChain(parentChain);
  const subtreeDepth = await getPageSubtreeMaxDepth(db, pageId, workspaceId);

  if (parentDepth === null || parentDepth + 1 + subtreeDepth >= MAX_TREE_DEPTH) {
    return { ok: false, reason: "depth_exceeded" };
  }

  return { ok: true };
}

export async function archivePageSubtree(
  db: Db,
  pageId: string,
  workspaceId: string,
  archivedAt: string,
): Promise<void> {
  await updatePageSubtreeArchiveState(db, pageId, workspaceId, {
    mode: "archive",
    updatedAt: archivedAt,
  });
}

export async function restorePageSubtree(
  db: Db,
  pageId: string,
  workspaceId: string,
  updatedAt: string,
): Promise<void> {
  await updatePageSubtreeArchiveState(db, pageId, workspaceId, {
    mode: "restore",
    updatedAt,
  });
}

type PageSubtreeArchiveMutation =
  | {
      mode: "archive";
      updatedAt: string;
    }
  | {
      mode: "restore";
      updatedAt: string;
    };

async function updatePageSubtreeArchiveState(
  db: Db,
  pageId: string,
  workspaceId: string,
  mutation: PageSubtreeArchiveMutation,
): Promise<void> {
  const setClause =
    mutation.mode === "archive"
      ? sql`
          archived_at = ${mutation.updatedAt},
          archive_root_id = ${pageId},
          updated_at = ${mutation.updatedAt}
        `
      : sql`
          archived_at = NULL,
          archive_root_id = NULL,
          updated_at = ${mutation.updatedAt}
        `;
  const rowPredicate =
    mutation.mode === "archive"
      ? sql`archived_at IS NULL`
      : sql`workspace_id = ${workspaceId} AND archive_root_id = ${pageId}`;

  await db.run(sql`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT id, 0
      FROM pages
      WHERE id = ${pageId}
        AND workspace_id = ${workspaceId}

      UNION ALL

      SELECT child.id, d.depth + 1
      FROM pages child
      JOIN descendants d ON child.parent_id = d.id
      WHERE child.workspace_id = ${workspaceId}
        AND d.depth < ${MAX_TREE_DEPTH - 1}
    )
    UPDATE pages
    SET ${setClause}
    -- Archive keeps workspace scoping in the descendants CTE and updates by
    -- primary-key id. Adding workspace_id here makes SQLite prefer
    -- idx_pages_workspace over primary-key lookups for small subtrees.
    -- Restore keeps workspace_id here so idx_pages_archive_operation narrows
    -- the operation before intersecting with the descendant ids.
    WHERE ${rowPredicate}
      AND id IN (SELECT id FROM descendants)
  `);
}
