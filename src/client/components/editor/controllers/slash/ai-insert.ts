import type { Editor, Range } from "@tiptap/core";
import { streamGenerate, AiStreamError } from "@/client/lib/ai/api";
import { extractDocumentTitle, extractGenerateContext } from "@/client/lib/ai/context";
import { parseAiBlocksFromText, isSingleInlineParagraph, getInlineTextFromParagraph } from "@/client/lib/ai/blocks";
import { toast } from "@/client/components/toast";
import {
  appendAiGenerateChunk,
  beginAiGenerate,
  endAiGenerate,
  getAiGenerateSession,
  registerAiGenerateAbort,
  unregisterAiGenerateAbort,
} from "../../extensions/ai-generate-indicator";
import type { EditorRuntimeSnapshot } from "../../editor-runtime-context";
import type { AiGenerateIntent } from "@/shared/types";

const activeGenerateControllers = new WeakMap<Editor, AbortController>();

export async function startGenerateAtRange(opts: {
  editor: Editor;
  range: Range;
  intent: AiGenerateIntent;
  runtime: EditorRuntimeSnapshot;
}): Promise<void> {
  const { editor, range, intent, runtime } = opts;
  if (!runtime.workspaceId || !runtime.pageId) return;

  const previous = activeGenerateControllers.get(editor);
  if (previous) previous.abort();

  editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).run();

  const startPos = editor.state.selection.from;
  const context = extractGenerateContext(editor.state, startPos);
  const pageTitle = extractDocumentTitle(editor.state.doc);
  const indicatorLabel = INDICATOR_LABELS[intent];

  const sessionId = beginAiGenerate(editor.view, startPos, indicatorLabel);

  const controller = new AbortController();
  activeGenerateControllers.set(editor, controller);
  registerAiGenerateAbort(sessionId, () => controller.abort());

  const iter = streamGenerate(
    runtime.workspaceId,
    runtime.pageId,
    {
      intent,
      beforeBlock: context.beforeBlock,
      afterBlock: context.afterBlock,
      pageTitle,
    },
    controller.signal,
  );

  let received = "";
  try {
    for await (const chunk of iter) {
      if (controller.signal.aborted) break;
      if (!chunk.text) continue;
      received += chunk.text;
      appendAiGenerateChunk(editor.view, sessionId, chunk.text);
    }
    if (controller.signal.aborted) {
      rollbackIfClean(editor, sessionId);
      return;
    }
    if (received.trim().length === 0) {
      rollbackIfClean(editor, sessionId);
      toast.error("The model returned no content. Try again or switch models.");
      return;
    }
    finalizeIfClean(editor, sessionId, received);
  } catch (err) {
    rollbackIfClean(editor, sessionId);
    if (controller.signal.aborted) return;
    const message = err instanceof AiStreamError ? err.message : "AI generation failed";
    toast.error(message);
  } finally {
    unregisterAiGenerateAbort(sessionId);
    endAiGenerate(editor.view, sessionId);
    if (activeGenerateControllers.get(editor) === controller) {
      activeGenerateControllers.delete(editor);
    }
  }
}

// Concurrent edits to the generated range mark the session dirty (range
// length diverged from the streamed accumulator, or the range collapsed). In
// that case never delete or replace — the doc now holds user/peer content
// and we must not overwrite it. Clean rollback uses the plugin's mapped
// `from`/`to`, not the original ints.
function rollbackIfClean(editor: Editor, sessionId: string): void {
  const session = getAiGenerateSession(editor.state);
  if (!session || session.sessionId !== sessionId) return;
  if (session.dirty) return;
  if (session.to <= session.from) return;
  const tr = editor.state.tr.delete(session.from, session.to);
  editor.view.dispatch(tr);
}

function finalizeIfClean(editor: Editor, sessionId: string, raw: string): void {
  const session = getAiGenerateSession(editor.state);
  if (!session || session.sessionId !== sessionId) return;
  if (session.dirty) {
    toast.info("Generation kept as-is — external edits detected.");
    return;
  }
  const { from, to } = session;
  if (to <= from) return;

  const blocks = parseAiBlocksFromText(raw);
  if (blocks.length === 0) return;
  if (isSingleInlineParagraph(blocks)) {
    const text = getInlineTextFromParagraph(blocks[0]);
    if (text === raw) return;
    const tr = editor.state.tr.insertText(text, from, to);
    editor.view.dispatch(tr);
    return;
  }

  const nodes = blocks
    .map((block) => {
      try {
        return editor.schema.nodeFromJSON(block);
      } catch {
        return null;
      }
    })
    .filter((node): node is NonNullable<typeof node> => node !== null);
  if (nodes.length === 0) return;

  // When the host block is a paragraph whose entire inline content is exactly
  // the streamed range, consume the host rather than splitting it, so the new
  // paragraphs don't leave an empty shell around them.
  let replaceFrom = from;
  let replaceTo = to;
  const $from = editor.state.doc.resolve(from);
  const depth = $from.depth;
  if (depth > 0) {
    const parent = $from.parent;
    if (parent.type.name === "paragraph") {
      const parentStart = $from.before(depth);
      const parentEnd = $from.after(depth);
      if (parentStart + 1 === from && parentEnd - 1 === to) {
        replaceFrom = parentStart;
        replaceTo = parentEnd;
      }
    }
  }

  const tr = editor.state.tr.replaceWith(replaceFrom, replaceTo, nodes);
  editor.view.dispatch(tr);
}

const INDICATOR_LABELS: Record<AiGenerateIntent, string> = {
  continue: "Continuing…",
  explain: "Explaining…",
  brainstorm: "Brainstorming…",
};
