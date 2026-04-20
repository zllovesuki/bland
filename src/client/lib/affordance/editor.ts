import {
  getPageAiEntitlements,
  getPageEditEntitlements,
  type EntitlementSurface,
  type PageAccessLevel,
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
  isFullMember?: boolean;
}): EditorAffordance {
  const { surface, pageAccess, workspaceId, online, isFullMember = surface === "canonical" } = input;
  const pageEdit = getPageEditEntitlements(surface, pageAccess);
  const aiSurface: EntitlementSurface = isFullMember ? "canonical" : "shared";
  const ai = getPageAiEntitlements(aiSurface, pageAccess);

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
