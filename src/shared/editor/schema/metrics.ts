import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const WORD_SPLIT = /\s+/;

export interface EditorTextMetrics {
  words: number;
  characters: number;
}

export const EMPTY_EDITOR_TEXT_METRICS: EditorTextMetrics = {
  words: 0,
  characters: 0,
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(WORD_SPLIT).length;
}

export function countCharacters(text: string): number {
  return Array.from(text).length;
}

export function collectEditorTextMetrics(node: ProseMirrorNode): EditorTextMetrics {
  return {
    words: countWords(node.textBetween(0, node.content.size, " ", " ")),
    characters: countCharacters(node.textBetween(0, node.content.size, undefined, " ")),
  };
}
