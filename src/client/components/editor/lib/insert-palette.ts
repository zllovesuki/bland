import { launchEmojiPicker } from "../controllers/emoji/insert-panel";
import { insertImageFromSlashMenu } from "../controllers/image/insert-panel";
import { getSlashMenuItems, type SlashMenuItem } from "../controllers/slash/items";
import { runtimeToUploadContext } from "./media-actions";
import { canInsertPageMentionAtRange } from "./page-mention/can-insert";
import { launchPageMentionPicker } from "./page-mention/open-picker";
import type { EditorRuntimeSnapshot } from "../editor-runtime-context";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import type { PageMentionCandidate } from "@/client/components/page-mention/types";

interface CreateInsertPaletteItemsOptions {
  getRuntime: () => EditorRuntimeSnapshot;
  getAffordance: () => EditorAffordance;
  getPageMentionCandidates: (excludePageId: string | undefined) => PageMentionCandidate[];
}

function canOpenMentions(getAffordance: () => EditorAffordance, editable: boolean) {
  return editable && getAffordance().canInsertPageMentions;
}

export function createInsertPaletteItems({
  getRuntime,
  getAffordance,
  getPageMentionCandidates,
}: CreateInsertPaletteItemsOptions): SlashMenuItem[] {
  return getSlashMenuItems({
    pageMention: {
      isAvailable: ({ editor }) =>
        canOpenMentions(getAffordance, editor.isEditable) && canInsertPageMentionAtRange(editor),
      openPicker: ({ editor, range }) => {
        if (!canOpenMentions(getAffordance, editor.isEditable)) return;
        launchPageMentionPicker(editor, {
          range,
          candidates: getPageMentionCandidates(getRuntime().pageId),
        });
      },
    },
    image: {
      isAvailable: ({ editor }) => editor.isEditable && getAffordance().canInsertImages && !!getRuntime().workspaceId,
      insertImage: ({ editor, range }) => {
        insertImageFromSlashMenu(editor, range, runtimeToUploadContext(getRuntime()));
      },
    },
    emoji: {
      openPicker: ({ editor, range }) => {
        launchEmojiPicker(editor, range);
      },
    },
  });
}
