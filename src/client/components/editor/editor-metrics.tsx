import { useTiptap, useTiptapState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { collectEditorTextMetrics, type EditorTextMetrics } from "@/shared/editor/schema";
import { EditorMetricsPresentation } from "@/shared/editor/components/metrics";

type CharacterCountStorage = {
  words: (options?: { node?: ProseMirrorNode }) => number;
  characters: (options?: { node?: ProseMirrorNode; mode?: "textSize" | "nodeSize" }) => number;
};

export interface EditorMetricsProps {
  className?: string;
}

function getEditorMetrics(editor: Editor): EditorTextMetrics {
  const storage = editor.storage as { characterCount?: CharacterCountStorage | undefined };
  const characterCount = storage.characterCount;

  if (characterCount?.words && characterCount.characters) {
    return {
      words: characterCount.words({ node: editor.state.doc }),
      characters: characterCount.characters({ node: editor.state.doc, mode: "textSize" }),
    };
  }

  return collectEditorTextMetrics(editor.state.doc);
}

export function EditorMetrics({ className }: EditorMetricsProps) {
  const { editor } = useTiptap();
  const metrics = useTiptapState(({ editor: currentEditor }) => getEditorMetrics(currentEditor));

  if (!editor || !metrics) {
    return null;
  }

  return <EditorMetricsPresentation metrics={metrics} className={className} />;
}
