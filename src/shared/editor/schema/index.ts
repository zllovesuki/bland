import type { AnyExtension } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import { StarterKit } from "@tiptap/starter-kit";
import { SharedCalloutExtension } from "./callout";
import { SharedCodeBlock } from "./code-block";
import { SharedDetailsBlockExtensions } from "./details";
import { SharedEmoji } from "./emoji";
import { SharedImage } from "./image";
import { countCharacters, countWords } from "./metrics";
import { SharedPageMentionNode } from "./page-mention";
import { createSharedTableExtensions } from "./table";
import { SharedTopLevelBlockAttributes } from "./top-level-blocks";

export function createHeadlessEditorExtensions(): AnyExtension[] {
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
    SharedEmoji,
    CharacterCount.configure({
      textCounter: countCharacters,
      wordCounter: countWords,
    }),
    TextStyle,
    Color,
    BackgroundColor,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    ...SharedDetailsBlockExtensions,
    SharedCalloutExtension,
    SharedCodeBlock.configure({
      defaultLanguage: "text",
      enableTabIndentation: true,
    }),
    SharedTopLevelBlockAttributes,
    SharedImage.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    SharedPageMentionNode,
    ...createSharedTableExtensions(),
  ] as AnyExtension[];
}

export * from "./callout";
export * from "./code-block";
export * from "./details";
export * from "./emoji";
export * from "./image";
export * from "./metrics";
export * from "./page-mention";
export * from "./table";
export * from "./top-level-blocks";
