import type { SharedInboxWorkspaceSummary, SharedWithMeItem } from "@/shared/types";
import { db, type SharedInboxItemRow, type SharedInboxSummaryRow } from "./bland-db";

interface ReplaceAllInput {
  items: SharedWithMeItem[];
  workspaceSummaries: SharedInboxWorkspaceSummary[];
}

async function replaceAll(input: ReplaceAllInput): Promise<void> {
  const itemRows: SharedInboxItemRow[] = input.items.map((item, rank) => ({
    pageId: item.page_id,
    workspaceId: item.workspace.id,
    rank,
    item,
  }));
  const summaryRows: SharedInboxSummaryRow[] = input.workspaceSummaries.map((summary, rank) => ({
    workspaceId: summary.workspace.id,
    rank,
    summary,
  }));

  await db.transaction("rw", [db.sharedInboxItems, db.sharedInboxWorkspaceSummaries], async () => {
    await db.sharedInboxItems.clear();
    if (itemRows.length > 0) {
      await db.sharedInboxItems.bulkPut(itemRows);
    }
    await db.sharedInboxWorkspaceSummaries.clear();
    if (summaryRows.length > 0) {
      await db.sharedInboxWorkspaceSummaries.bulkPut(summaryRows);
    }
  });
}

export const sharedInboxCommands = {
  replaceAll,
};
