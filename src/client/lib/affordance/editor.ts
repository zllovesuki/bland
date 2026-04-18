import { getPageEditEntitlements, type EntitlementSurface, type PageAccessLevel } from "@/shared/entitlements";

export interface EditorAffordance {
  documentEditable: boolean;
  canInsertPageMentions: boolean;
  canInsertImages: boolean;
}

export function deriveEditorAffordance(input: {
  surface: EntitlementSurface;
  pageAccess: PageAccessLevel;
  workspaceId: string | undefined;
  online: boolean;
}): EditorAffordance {
  const { surface, pageAccess, workspaceId, online } = input;
  const entitlements = getPageEditEntitlements(surface, pageAccess);

  return {
    documentEditable: entitlements.editDocument,
    canInsertPageMentions: entitlements.insertPageMention && !!workspaceId,
    canInsertImages: entitlements.uploadImage && !!workspaceId && online,
  };
}
