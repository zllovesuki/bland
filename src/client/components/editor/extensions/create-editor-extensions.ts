import type { AnyExtension } from "@tiptap/core";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
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
import { DetailsBlockExtensions } from "./details-block";
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

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
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
    // Keep quote and ellipsis fixes for prose, but avoid operator-style
    // rewrites that are risky in technical and code-adjacent writing.
    Typography.configure({
      emDash: false,
      openDoubleQuote: false,
      closeDoubleQuote: false,
      openSingleQuote: false,
      closeSingleQuote: false,
      leftArrow: false,
      rightArrow: false,
      copyright: false,
      trademark: false,
      servicemark: false,
      registeredTrademark: false,
      oneHalf: false,
      plusMinus: false,
      notEqual: false,
      laquo: false,
      raquo: false,
      multiplication: false,
      superscriptTwo: false,
      superscriptThree: false,
      oneQuarter: false,
      threeQuarters: false,
    }),
    CharacterCount.configure({
      textCounter: countCharacters,
      wordCounter: countWords,
    }),
    TextStyle,
    Color,
    BackgroundColor,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ...DetailsBlockExtensions,
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
