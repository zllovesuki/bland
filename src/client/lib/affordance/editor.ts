import {
  getPageAiEntitlements,
  getPageEditEntitlements,
  type EntitlementSurface,
  type PageAccessLevel,
  type ResolvedWorkspaceRole,
} from "@/shared/entitlements";

export interface EditorAffordance {
  documentEditable: boolean;
  canInsertPageMentions: boolean;
  canInsertImages: boolean;
  canUseAiRewrite: boolean;
  canUseAiGenerate: boolean;
  canSummarizePage: boolean;
  canAskPage: boolean;
}

export function deriveEditorAffordance(input: {
  surface: EntitlementSurface;
  pageAccess: PageAccessLevel;
  workspaceId: string | undefined;
  online: boolean;
  workspaceRole: ResolvedWorkspaceRole;
}): EditorAffordance {
  const { surface, pageAccess, workspaceId, online, workspaceRole } = input;
  const pageEdit = getPageEditEntitlements(surface, pageAccess);
  // AI entitlements are role-aware: `getPageAiEntitlements` denies guests and
  // non-members on canonical surface, and denies everyone on shared surface.
  const ai = getPageAiEntitlements(surface, pageAccess, workspaceRole);

  return {
    documentEditable: pageEdit.editDocument,
    canInsertPageMentions: pageEdit.insertPageMention && !!workspaceId,
    canInsertImages: pageEdit.uploadImage && !!workspaceId && online,
    canUseAiRewrite: ai.useAiRewrite && online,
    canUseAiGenerate: ai.useAiGenerate && online,
    canSummarizePage: ai.summarizePage && online,
    canAskPage: ai.askPage && online,
  };
}
