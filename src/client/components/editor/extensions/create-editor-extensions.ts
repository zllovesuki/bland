import type { AnyExtension } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle, Color, BackgroundColor } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { FileHandler } from "@tiptap/extension-file-handler";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { ShareAwareImage } from "./image-node";
import { HighlightedCodeBlock } from "./code-block-extension";
import { BlockDragDropBehavior } from "./block-drag-drop";
import { createTableExtensions } from "./table-extensions";
import { SlashCommands } from "../controllers/slash-menu-extension";
import { IMAGE_MIME_TYPES, uploadAndInsertImage, uploadAndInsertImageAtPos } from "../lib/media-actions";

interface CreateEditorExtensionsOpts {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  user: { name: string; color: string; avatar_url: string | null };
  workspaceId: string | undefined;
  pageId: string;
  shareToken: string | undefined;
}

export function createEditorExtensions(opts: CreateEditorExtensionsOpts): AnyExtension[] {
  const { fragment, provider, user, workspaceId, pageId, shareToken } = opts;
  const ctx = { workspaceId, pageId, shareToken };

  return [
    StarterKit.configure({
      undoRedo: false,
      dropcursor: false,
      link: { openOnClick: false, autolink: true },
      codeBlock: false,
    }),
    TextStyle,
    Color,
    BackgroundColor,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    HighlightedCodeBlock.configure({
      defaultLanguage: "text",
      enableTabIndentation: true,
    }),
    Collaboration.configure({ fragment }),
    CollaborationCaret.configure({
      provider,
      user: {
        name: user.name,
        color: user.color,
        avatar_url: user.avatar_url,
      },
    }),
    Placeholder.configure({
      placeholder: "Type '/' for commands...",
    }),
    BlockDragDropBehavior,
    ShareAwareImage.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_MIME_TYPES,
      onPaste: (currentEditor, files) => {
        if (!currentEditor.isEditable || !workspaceId) return;
        void (async () => {
          for (const file of files) {
            await uploadAndInsertImage(currentEditor, ctx, file);
          }
        })();
      },
      onDrop: (currentEditor, files, pos) => {
        if (!currentEditor.isEditable || !workspaceId) return;
        void (async () => {
          let insertPos = pos;
          for (const file of files) {
            insertPos = await uploadAndInsertImageAtPos(currentEditor, ctx, file, insertPos);
          }
        })();
      },
    }),
    SlashCommands,
    ...createTableExtensions(),
  ] as AnyExtension[];
}
