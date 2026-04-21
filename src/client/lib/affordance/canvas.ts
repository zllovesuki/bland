import { getPageEditEntitlements, type EntitlementSurface, type PageAccessLevel } from "@/shared/entitlements";

export interface CanvasAffordance {
  canEdit: boolean;
  canInsertImages: boolean;
}

export function deriveCanvasAffordance(input: {
  surface: EntitlementSurface;
  pageAccess: PageAccessLevel;
  workspaceId: string | undefined;
  online: boolean;
}): CanvasAffordance {
  const { surface, pageAccess, workspaceId, online } = input;
  const pageEdit = getPageEditEntitlements(surface, pageAccess);
  return {
    canEdit: pageEdit.editDocument,
    canInsertImages: pageEdit.uploadImage && !!workspaceId && online,
  };
}
