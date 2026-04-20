import type { Editor, Range } from "@tiptap/core";
import { streamGenerate, AiStreamError } from "@/client/lib/ai/api";
import { extractDocumentTitle, extractGenerateContext } from "@/client/lib/ai/context";
import { parseAiBlocksFromText, isSingleInlineParagraph, getInlineTextFromParagraph } from "@/client/lib/ai/blocks";
import { toast } from "@/client/components/toast";
import {
  beginAiGenerate,
  endAiGenerate,
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

  let insertionPos = startPos;
  let received = "";
  try {
    for await (const chunk of iter) {
      if (controller.signal.aborted) break;
      if (!chunk.text) continue;
      received += chunk.text;
      const tr = editor.state.tr.insertText(chunk.text, insertionPos);
      editor.view.dispatch(tr);
      insertionPos += chunk.text.length;
    }
    if (controller.signal.aborted) {
      rollbackInserted(editor, startPos, insertionPos);
      return;
    }
    if (received.trim().length === 0) {
      rollbackInserted(editor, startPos, insertionPos);
      toast.error("The model returned no content. Try again or switch models.");
      return;
    }
    finalizeGenerated(editor, startPos, insertionPos, received);
  } catch (err) {
    rollbackInserted(editor, startPos, insertionPos);
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

function rollbackInserted(editor: Editor, from: number, to: number): void {
  if (to <= from) return;
  const tr = editor.state.tr.delete(from, to);
  editor.view.dispatch(tr);
}

function finalizeGenerated(editor: Editor, from: number, to: number, raw: string): void {
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
