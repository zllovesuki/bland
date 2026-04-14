import { useTiptap, useTiptapState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { formatReadTime } from "./lib/read-time";

type CharacterCountStorage = {
  words: (options?: { node?: ProseMirrorNode }) => number;
  characters: (options?: { node?: ProseMirrorNode; mode?: "textSize" | "nodeSize" }) => number;
};

export interface EditorMetricsProps {
  className?: string;
}

const NUMBER_FORMATTER = new Intl.NumberFormat();

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function getDocText(editor: Editor): string {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", " ");
}

function getEditorMetrics(editor: Editor): { words: number; characters: number } {
  const storage = editor.storage as { characterCount?: CharacterCountStorage | undefined };
  const characterCount = storage.characterCount;

  if (characterCount?.words && characterCount.characters) {
    return {
      words: characterCount.words({ node: editor.state.doc }),
      characters: characterCount.characters({ node: editor.state.doc, mode: "textSize" }),
    };
  }

  const text = getDocText(editor);
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  return {
    words,
    characters: Array.from(text).length,
  };
}

export function EditorMetrics({ className }: EditorMetricsProps) {
  const { editor } = useTiptap();
  const metrics = useTiptapState(({ editor: currentEditor }) => getEditorMetrics(currentEditor));

  if (!editor || !metrics) {
    return null;
  }

  const wordsLabel = formatCount(metrics.words, "word", "words");
  const charsLabel = formatCount(metrics.characters, "char", "chars");
  const readTimeLabel = formatReadTime(metrics.words);

  return (
    <div
      className={["flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-zinc-500", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Document metrics: ${wordsLabel}, ${charsLabel}, ${readTimeLabel}`}
    >
      <span>{wordsLabel}</span>
      <span aria-hidden="true" className="text-zinc-700">
        ·
      </span>
      <span>{charsLabel}</span>
      <span aria-hidden="true" className="text-zinc-700">
        ·
      </span>
      <span>{readTimeLabel}</span>
    </div>
  );
}
