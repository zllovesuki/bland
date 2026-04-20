import type { EditorState } from "@tiptap/pm/state";
import { isAiGenerateInflight } from "../extensions/ai-generate-indicator";
import { isAiRewriteInflight } from "../extensions/ai-suggestion";

export const AI_BUSY_REASON = {
  generate: "Still writing — one at a time",
  rewrite: "Still rewriting — one at a time",
} as const;

export function getAiBusyReason(state: EditorState): string | null {
  if (isAiGenerateInflight(state)) return AI_BUSY_REASON.generate;
  if (isAiRewriteInflight(state)) return AI_BUSY_REASON.rewrite;
  return null;
}
