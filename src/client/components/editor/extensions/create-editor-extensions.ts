import type { AnyExtension } from "@tiptap/core";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle, Color, BackgroundColor } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Collaboration } from "@tiptap/extension-collaboration";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { FileHandler } from "@tiptap/extension-file-handler";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { createCollaborationCaret } from "./collaboration-caret";
import { ShareAwareImage } from "./image/node";
import { EditorEmoji } from "./emoji";
import { HighlightedCodeBlock } from "./code-block/extension";
import { BlockDragDropBehavior } from "./block-drag-drop";
import { CalloutExtension } from "./callout";
import { DetailsBlockExtensions } from "./details-block";
import { createTableExtensions } from "./table-extensions";
import { ContextAwareSelectAll } from "./context-aware-select-all";
import { TopLevelBlockIdentity } from "./top-level-block-identity";
import { PageMentionNode } from "./page-mention/node";
import { PageMentionSuggestion } from "./page-mention/suggestion";
import { SlashCommands } from "../controllers/slash/extension";
import { createInsertPaletteItems } from "../lib/insert-palette";
import { createImageFileHandlerConfig } from "../lib/media-actions";
import type { EditorRuntimeSnapshot } from "../editor-runtime-context";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import type { PageMentionCandidate } from "@/client/components/page-mention/types";

interface CreateEditorExtensionsOpts {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  user: { userId: string | null };
  resolveIdentity: ResolveIdentity;
  getRuntime: () => EditorRuntimeSnapshot;
  getAffordance: () => EditorAffordance;
  getPageMentionCandidates: (excludePageId: string | undefined) => PageMentionCandidate[];
}

const WORD_SPLIT = /\s+/;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(WORD_SPLIT).length;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

export function createEditorExtensions(opts: CreateEditorExtensionsOpts): AnyExtension[] {
  const { fragment, provider, user, resolveIdentity, getRuntime, getAffordance, getPageMentionCandidates } = opts;
  const getInsertPaletteItems = () =>
    createInsertPaletteItems({
      getRuntime,
      getAffordance,
      getPageMentionCandidates,
    });

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
    CalloutExtension,
    HighlightedCodeBlock.configure({
      defaultLanguage: "text",
      enableTabIndentation: true,
    }),
    Collaboration.configure({ fragment }),
    createCollaborationCaret({ provider, user, resolveIdentity }),
    Placeholder.configure({
      placeholder: "Start typing, or press / for blocks",
    }),
    TopLevelBlockIdentity,
    BlockDragDropBehavior,
    ShareAwareImage.configure({ inline: false, allowBase64: false, getRuntime }),
    TaskList,
    TaskItem.configure({ nested: true }),
    FileHandler.configure(createImageFileHandlerConfig({ getRuntime, getAffordance })),
    SlashCommands.configure({ getItems: getInsertPaletteItems }),
    PageMentionNode,
    PageMentionSuggestion.configure({
      getCurrentPageId: () => getRuntime().pageId,
      isAvailable: (editor) => editor.isEditable && getAffordance().canInsertPageMentions,
      getCandidates: () => getPageMentionCandidates(getRuntime().pageId),
    }),
    ...createTableExtensions(),
    // Registered last so Tiptap's keymap resolver (runs most-recently-added
    // shortcuts first) picks this Mod-a handler before StarterKit's default
    // selectAll, enabling the container-scoped escalation ladder.
    ContextAwareSelectAll,
  ] as AnyExtension[];
}
