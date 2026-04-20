import type { Editor } from "@tiptap/core";
import { streamRewrite, AiStreamError } from "@/client/lib/ai/api";
import { extractDocumentTitle, extractRewriteContext } from "@/client/lib/ai/context";
import {
  appendAiSuggestion,
  cancelAiSuggestion,
  errorAiSuggestion,
  finishAiSuggestion,
  registerAiRewriteAbort,
  startAiSuggestion,
  unregisterAiRewriteAbort,
} from "../extensions/ai-suggestion";
import type { AiRewriteAction } from "@/shared/types";
import type { EditorRuntimeSnapshot } from "../editor-runtime-context";

const activeRewriteControllers = new WeakMap<Editor, AbortController>();

export async function runRewrite(opts: {
  editor: Editor;
  action: AiRewriteAction;
  runtime: EditorRuntimeSnapshot;
}): Promise<void> {
  const { editor, action, runtime } = opts;
  if (!runtime.workspaceId || !runtime.pageId) return;

  const selection = editor.state.selection;
  if (selection.empty) return;
  const { from, to } = selection;

  const context = extractRewriteContext(editor.state);
  if (!context.selectedText) return;

  const previous = activeRewriteControllers.get(editor);
  if (previous) previous.abort();

  const controller = new AbortController();
  activeRewriteControllers.set(editor, controller);

  const pageTitle = extractDocumentTitle(editor.state.doc);
  const sessionId = startAiSuggestion(editor.view, from, to);
  registerAiRewriteAbort(sessionId, () => controller.abort());

  const iter = streamRewrite(
    runtime.workspaceId,
    runtime.pageId,
    {
      action,
      selectedText: context.selectedText,
      parentBlock: context.parentBlock,
      beforeBlock: context.beforeBlock,
      afterBlock: context.afterBlock,
      pageTitle,
    },
    controller.signal,
  );

  let received = "";
  let pending = "";
  let rafId: number | null = null;
  const flush = () => {
    rafId = null;
    if (pending.length === 0) return;
    if (controller.signal.aborted) {
      pending = "";
      return;
    }
    appendAiSuggestion(editor.view, sessionId, pending);
    pending = "";
  };

  try {
    try {
      for await (const chunk of iter) {
        if (controller.signal.aborted) break;
        if (!chunk.text) continue;
        received += chunk.text;
        pending += chunk.text;
        if (rafId === null) rafId = requestAnimationFrame(flush);
      }
    } finally {
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
    }
    if (controller.signal.aborted) return;
    if (received.trim().length === 0) {
      errorAiSuggestion(editor.view, sessionId, "The model returned no content. Try again or switch models.");
    } else {
      finishAiSuggestion(editor.view, sessionId);
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    if (err instanceof AiStreamError) {
      errorAiSuggestion(editor.view, sessionId, err.message);
    } else {
      errorAiSuggestion(editor.view, sessionId, "AI rewrite failed");
    }
  } finally {
    unregisterAiRewriteAbort(sessionId);
    if (activeRewriteControllers.get(editor) === controller) {
      activeRewriteControllers.delete(editor);
    }
  }
}

export function dismissRewrite(editor: Editor): void {
  const controller = activeRewriteControllers.get(editor);
  if (controller) {
    controller.abort();
    activeRewriteControllers.delete(editor);
  }
  cancelAiSuggestion(editor.view);
}
