import Dexie, { type Table } from "dexie";
import type {
  Page,
  Workspace,
  WorkspaceMembershipSummary,
  WorkspaceMember,
  WorkspaceRole,
  SharedWithMeItem,
  SharedInboxWorkspaceSummary,
} from "@/shared/types";

export type WorkspaceAccessMode = "member" | "shared";

export type PageAccessMode = "view" | "edit";

export interface MemberWorkspaceRow extends WorkspaceMembershipSummary {
  /** Preserves the source API ordering across Dexie rehydration; read via
   *  `orderBy("rank")` so workspace-switcher + root-redirect fallback see the
   *  same order the server returned. */
  rank: number;
}

export interface WorkspaceReplicaRow {
  id: string;
  workspace: Workspace;
  slug: string;
  accessMode: WorkspaceAccessMode;
  workspaceRole: WorkspaceRole | null;
}

export interface WorkspacePageRow extends Page {}

export interface WorkspaceMemberRow extends WorkspaceMember {}

export interface PageAccessRow {
  pageId: string;
  mode: PageAccessMode;
}

export interface SharedInboxItemRow {
  pageId: string;
  workspaceId: string;
  rank: number;
  item: SharedWithMeItem;
}

export interface SharedInboxSummaryRow {
  workspaceId: string;
  rank: number;
  summary: SharedInboxWorkspaceSummary;
}

export interface LastVisitedPageRow {
  workspaceId: string;
  pageId: string;
}

export type WorkspaceMetaKey = "owner" | "lastVisitedWorkspaceId";

export interface WorkspaceMetaRow {
  key: WorkspaceMetaKey;
  value: string | null;
}

export class BlandDatabase extends Dexie {
  memberWorkspaces!: Table<MemberWorkspaceRow, string>;
  workspaceReplicas!: Table<WorkspaceReplicaRow, string>;
  workspacePages!: Table<WorkspacePageRow, string>;
  workspaceMembers!: Table<WorkspaceMemberRow, [string, string]>;
  pageAccess!: Table<PageAccessRow, string>;
  sharedInboxItems!: Table<SharedInboxItemRow, string>;
  sharedInboxWorkspaceSummaries!: Table<SharedInboxSummaryRow, string>;
  lastVisitedPages!: Table<LastVisitedPageRow, string>;
  workspaceMeta!: Table<WorkspaceMetaRow, string>;

  constructor(name: string) {
    super(name);
    // parent_id and archived_at are intentionally not indexed: Dexie cannot
    // index null values. We build tree shape and filter archived rows in
    // memory from the flat page projection. Index property paths match the
    // row key names verbatim (snake_case for Page/WorkspaceMember rows, which
    // reflect the shared API shape).
    this.version(1).stores({
      memberWorkspaces: "id, slug, rank",
      workspaceReplicas: "id, slug",
      workspacePages: "id, workspace_id",
      workspaceMembers: "[workspace_id+user_id], workspace_id",
      pageAccess: "pageId",
      sharedInboxItems: "pageId, workspaceId, rank",
      sharedInboxWorkspaceSummaries: "workspaceId, rank",
      lastVisitedPages: "workspaceId",
      workspaceMeta: "key",
    });
  }
}

export function createDb(name: string): BlandDatabase {
  return new BlandDatabase(name);
}

export const db: BlandDatabase = createDb("bland");
