import type { PageAccessLevel } from "@/shared/entitlements";
import { deriveEditorAffordance, type EditorAffordance } from "@/client/lib/affordance/editor";
import { deriveCanvasAffordance, type CanvasAffordance } from "@/client/lib/affordance/canvas";
import type { PageKind } from "@/shared/types";

interface SharePageAffordanceBase {
  showViewOnlyBadge: boolean;
}

export type SharePageAffordance =
  | (SharePageAffordanceBase & {
      kind: "doc";
      editor: EditorAffordance;
    })
  | (SharePageAffordanceBase & {
      kind: "canvas";
      canvas: CanvasAffordance;
    });

export function deriveSharePageAffordance(input: {
  pageKind: PageKind;
  pageAccess: PageAccessLevel;
  workspaceId: string | undefined;
  online: boolean;
}): SharePageAffordance {
  const { pageKind, pageAccess, workspaceId, online } = input;
  if (pageKind === "canvas") {
    const canvas = deriveCanvasAffordance({
      surface: "shared",
      pageAccess,
      workspaceId,
      online,
    });
    return {
      kind: "canvas",
      showViewOnlyBadge: !canvas.canEdit,
      canvas,
    };
  }

  const editor = deriveEditorAffordance({
    surface: "shared",
    pageAccess,
    workspaceId,
    online,
    // Shared surface entitlements deny every AI action regardless of role, so
    // role is informational here. Emit "none" to make the link-scoped contract
    // explicit at the callsite.
    workspaceRole: "none",
  });
  return {
    kind: "doc",
    showViewOnlyBadge: !editor.documentEditable,
    editor,
  };
}
