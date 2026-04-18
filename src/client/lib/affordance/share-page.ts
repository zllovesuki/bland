import type { PageAccessLevel } from "@/shared/entitlements";
import { deriveEditorAffordance, type EditorAffordance } from "@/client/lib/affordance/editor";

export interface SharePageAffordance {
  showViewOnlyBadge: boolean;
  editor: EditorAffordance;
}

export function deriveSharePageAffordance(input: {
  pageAccess: PageAccessLevel;
  workspaceId: string | undefined;
  online: boolean;
}): SharePageAffordance {
  const { pageAccess, workspaceId, online } = input;
  const editor = deriveEditorAffordance({
    surface: "shared",
    pageAccess,
    workspaceId,
    online,
  });

  return {
    showViewOnlyBadge: !editor.documentEditable,
    editor,
  };
}
