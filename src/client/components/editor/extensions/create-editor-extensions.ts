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
import { ShareAwareImage } from "./image/node";
import { EditorEmoji } from "./emoji";
import { HighlightedCodeBlock } from "./code-block/extension";
import { BlockDragDropBehavior } from "./block-drag-drop";
import { DetailsBlockExtensions } from "./details-block";
import { createTableExtensions } from "./table-extensions";
import { TopLevelBlockIdentity } from "./top-level-block-identity";
import { PageMentionNode } from "./page-mention/node";
import { PageMentionSuggestion } from "./page-mention/suggestion";
import { SlashCommands } from "../controllers/slash/extension";
import { launchEmojiPicker } from "../controllers/emoji/insert-panel";
import { insertImageFromSlashMenu } from "../controllers/image/insert-panel";
import type {
  SlashMenuEmojiConfig,
  SlashMenuImageConfig,
  SlashMenuPageMentionConfig,
} from "../controllers/slash/items";
import { canInsertPageMentionAtRange, canInsertPageMentions } from "../lib/page-mention/can-insert";
import { launchPageMentionPicker } from "../lib/page-mention/open-picker";
import {
  IMAGE_MIME_TYPES,
  insertImagePlaceholderAtPos,
  insertImagePlaceholderAtRange,
  uploadAndReplaceImageAtTarget,
  type ImageNodeTarget,
} from "../lib/media-actions";
import type { EditorRuntimeSnapshot } from "../editor-runtime-context";

interface CreateEditorExtensionsOpts {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  user: { name: string; color: string; avatar_url: string | null };
  getRuntime: () => EditorRuntimeSnapshot;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

export function createEditorExtensions(opts: CreateEditorExtensionsOpts): AnyExtension[] {
  const { fragment, provider, user, getRuntime } = opts;
  const getUploadContext = () => {
    const runtime = getRuntime();
    return {
      workspaceId: runtime.workspaceId,
      pageId: runtime.pageId,
      shareToken: runtime.shareToken,
    };
  };
  const canOpenMentions = (editable: boolean) => {
    const runtime = getRuntime();
    return canInsertPageMentions({
      editable,
      workspaceId: runtime.workspaceId,
      shareToken: runtime.shareToken,
    });
  };

  const pageMentionSlashConfig: SlashMenuPageMentionConfig = {
    isAvailable: ({ editor }) => canOpenMentions(editor.isEditable) && canInsertPageMentionAtRange(editor),
    openPicker: ({ editor, range }) => {
      if (!canOpenMentions(editor.isEditable)) return;
      launchPageMentionPicker(editor, {
        range,
        currentPageId: getRuntime().pageId,
        workspaceId: getRuntime().workspaceId,
      });
    },
  };

  const imageSlashConfig: SlashMenuImageConfig = {
    insertImage: ({ editor, range }) => {
      insertImageFromSlashMenu(editor, range, getUploadContext());
    },
  };

  const emojiSlashConfig: SlashMenuEmojiConfig = {
    openPicker: ({ editor, range }) => {
      launchEmojiPicker(editor, range);
    },
  };

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
    EditorEmoji,
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
      placeholder: "Start typing, or press / for blocks",
    }),
    TopLevelBlockIdentity,
    BlockDragDropBehavior,
    ShareAwareImage.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_MIME_TYPES,
      onPaste: (currentEditor, files) => {
        const runtime = getRuntime();
        if (!currentEditor.isEditable || !runtime.workspaceId || files.length === 0) return;
        const selection = currentEditor.state.selection;
        const placeholders: ImageNodeTarget[] = [];
        const first = insertImagePlaceholderAtRange(currentEditor, { from: selection.from, to: selection.to });
        if (!first) return;
        placeholders.push(first.target);
        let insertPos = first.nextPos;
        for (const _file of files.slice(1)) {
          const placeholder = insertImagePlaceholderAtPos(currentEditor, insertPos);
          if (!placeholder) break;
          placeholders.push(placeholder.target);
          insertPos = placeholder.nextPos;
        }
        void (async () => {
          for (const [index, file] of files.entries()) {
            const target = placeholders[index];
            if (!target) break;
            await uploadAndReplaceImageAtTarget(currentEditor, getUploadContext(), file, target);
          }
        })();
      },
      onDrop: (currentEditor, files, pos) => {
        const runtime = getRuntime();
        if (!currentEditor.isEditable || !runtime.workspaceId || files.length === 0) return;
        const placeholders: ImageNodeTarget[] = [];
        let insertPos = pos;
        for (const _file of files) {
          const placeholder = insertImagePlaceholderAtPos(currentEditor, insertPos);
          if (!placeholder) break;
          placeholders.push(placeholder.target);
          insertPos = placeholder.nextPos;
        }
        void (async () => {
          for (const [index, file] of files.entries()) {
            const target = placeholders[index];
            if (!target) break;
            await uploadAndReplaceImageAtTarget(currentEditor, getUploadContext(), file, target);
          }
        })();
      },
    }),
    SlashCommands.configure({ pageMention: pageMentionSlashConfig, image: imageSlashConfig, emoji: emojiSlashConfig }),
    PageMentionNode,
    PageMentionSuggestion.configure({
      getCurrentPageId: () => getRuntime().pageId,
      isAvailable: (editor) => canOpenMentions(editor.isEditable),
      getRuntime,
    }),
    ...createTableExtensions(),
  ] as AnyExtension[];
}
