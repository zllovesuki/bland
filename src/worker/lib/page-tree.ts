import { sql } from "drizzle-orm";

import { MAX_TREE_DEPTH } from "@/shared/constants";
import type { Db } from "@/worker/db/d1/client";

export type PageAncestorRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
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
        AND p.archived_at IS NULL

      UNION ALL

      SELECT child.id, d.depth + 1
      FROM pages child
      JOIN descendants d ON child.parent_id = d.id
      WHERE child.workspace_id = ${workspaceId}
        AND child.archived_at IS NULL
        AND d.depth < ${MAX_TREE_DEPTH}
    )
    SELECT MAX(depth) AS max_depth
    FROM descendants
  `);

  return rows[0]?.max_depth ?? 0;
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
