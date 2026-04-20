import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { parseAiBlocksFromText, isSingleInlineParagraph, getInlineTextFromParagraph } from "@/client/lib/ai/blocks";
import "../styles/ai-suggestion.css";

interface AiSuggestionState {
  active: {
    sessionId: string;
    from: number;
    to: number;
    buffer: string;
    status: "streaming" | "ready" | "error";
    error?: string;
  } | null;
}

export const aiSuggestionKey = new PluginKey<AiSuggestionState>("aiSuggestion");

const rewriteAbortHandlers = new Map<string, () => void>();

export function registerAiRewriteAbort(sessionId: string, handler: () => void): void {
  rewriteAbortHandlers.set(sessionId, handler);
}

export function unregisterAiRewriteAbort(sessionId: string): void {
  rewriteAbortHandlers.delete(sessionId);
}

function triggerAiRewriteAbort(sessionId: string): void {
  const handler = rewriteAbortHandlers.get(sessionId);
  if (handler) handler();
}

type AiSuggestionMeta =
  | { type: "start"; sessionId: string; from: number; to: number }
  | { type: "append"; sessionId: string; text: string }
  | { type: "finish"; sessionId: string }
  | { type: "error"; sessionId: string; message: string }
  | { type: "cancel" }
  | { type: "commit" };

export function startAiSuggestion(view: EditorView, from: number, to: number): string {
  const sessionId = createSessionId();
  view.dispatch(
    view.state.tr.setMeta(aiSuggestionKey, { type: "start", sessionId, from, to } satisfies AiSuggestionMeta),
  );
  return sessionId;
}

export function appendAiSuggestion(view: EditorView, sessionId: string, text: string): void {
  view.dispatch(view.state.tr.setMeta(aiSuggestionKey, { type: "append", sessionId, text } satisfies AiSuggestionMeta));
}

export function finishAiSuggestion(view: EditorView, sessionId: string): void {
  view.dispatch(view.state.tr.setMeta(aiSuggestionKey, { type: "finish", sessionId } satisfies AiSuggestionMeta));
}

export function errorAiSuggestion(view: EditorView, sessionId: string, message: string): void {
  view.dispatch(
    view.state.tr.setMeta(aiSuggestionKey, { type: "error", sessionId, message } satisfies AiSuggestionMeta),
  );
}

export function cancelAiSuggestion(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(aiSuggestionKey, { type: "cancel" } satisfies AiSuggestionMeta));
}

export function commitAiSuggestion(view: EditorView): boolean {
  const current = aiSuggestionKey.getState(view.state);
  if (!current?.active) return false;
  const { from, to, buffer } = current.active;

  const tr = view.state.tr;
  const blocks = parseAiBlocksFromText(buffer);
  if (blocks.length === 0) {
    tr.delete(from, to);
  } else if (isSingleInlineParagraph(blocks)) {
    const text = getInlineTextFromParagraph(blocks[0]);
    if (text) {
      tr.insertText(text, from, to);
    } else {
      tr.delete(from, to);
    }
  } else {
    const nodes = blocks
      .map((block) => {
        try {
          return view.state.schema.nodeFromJSON(block);
        } catch {
          return null;
        }
      })
      .filter((node): node is NonNullable<typeof node> => node !== null);
    if (nodes.length === 0) {
      tr.insertText(buffer, from, to);
    } else {
      tr.replaceWith(from, to, nodes);
    }
  }
  tr.setMeta(aiSuggestionKey, { type: "cancel" } satisfies AiSuggestionMeta);
  view.dispatch(tr);
  return true;
}

export function getAiSuggestionState(state: EditorState): AiSuggestionState | null {
  return aiSuggestionKey.getState(state) ?? null;
}

export function isAiRewriteInflight(state: EditorState): boolean {
  const plugin = aiSuggestionKey.getState(state);
  return plugin?.active?.status === "streaming";
}

export const AiSuggestion = Extension.create({
  name: "aiSuggestion",

  addProseMirrorPlugins() {
    return [
      new Plugin<AiSuggestionState>({
        key: aiSuggestionKey,
        state: {
          init(): AiSuggestionState {
            return { active: null };
          },
          apply(tr: Transaction, value: AiSuggestionState): AiSuggestionState {
            const meta = tr.getMeta(aiSuggestionKey) as AiSuggestionMeta | undefined;

            if (meta?.type === "start") {
              return {
                active: {
                  sessionId: meta.sessionId,
                  from: meta.from,
                  to: meta.to,
                  buffer: "",
                  status: "streaming",
                },
              };
            }
            if (meta?.type === "cancel" || meta?.type === "commit") {
              return { active: null };
            }

            if (!value.active) return value;

            if (meta?.type === "append") {
              if (meta.sessionId !== value.active.sessionId) return value;
              return {
                active: { ...value.active, buffer: value.active.buffer + meta.text },
              };
            }
            if (meta?.type === "finish") {
              if (meta.sessionId !== value.active.sessionId) return value;
              return { active: { ...value.active, status: "ready" } };
            }
            if (meta?.type === "error") {
              if (meta.sessionId !== value.active.sessionId) return value;
              return { active: { ...value.active, status: "error", error: meta.message } };
            }

            if (tr.docChanged) {
              const from = tr.mapping.map(value.active.from, -1);
              const to = tr.mapping.map(value.active.to, 1);
              if (to <= from) return { active: null };
              return { active: { ...value.active, from, to } };
            }

            return value;
          },
        },
        props: {
          decorations(state) {
            const plugin = aiSuggestionKey.getState(state);
            if (!plugin?.active) return null;
            const { from, to, buffer, status, error } = plugin.active;
            const decorations: Decoration[] = [
              Decoration.inline(from, to, { class: "tiptap-ai-target" }),
              Decoration.widget(to, () => renderPreview({ buffer, status, error }), {
                side: 1,
                ignoreSelection: true,
                key: `ai-suggestion-preview:${buffer.length}:${status}`,
              }),
            ];
            return DecorationSet.create(state.doc, decorations);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              const button = target.closest<HTMLButtonElement>("[data-ai-suggestion-action]");
              if (!button) return false;
              event.preventDefault();
              const action = button.dataset.aiSuggestionAction;
              const plugin = aiSuggestionKey.getState(view.state);
              if (action === "accept") {
                commitAiSuggestion(view);
              } else if (action === "reject") {
                if (plugin?.active?.status === "streaming") {
                  triggerAiRewriteAbort(plugin.active.sessionId);
                }
                cancelAiSuggestion(view);
              }
              return true;
            },
          },
          handleKeyDown(view, event) {
            const plugin = aiSuggestionKey.getState(view.state);
            if (!plugin?.active) return false;

            if (event.key === "Escape") {
              if (plugin.active.status === "streaming") {
                triggerAiRewriteAbort(plugin.active.sessionId);
              }
              cancelAiSuggestion(view);
              return true;
            }

            if (event.key === "Enter" && plugin.active.status === "ready") {
              commitAiSuggestion(view);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

function renderPreview(args: { buffer: string; status: "streaming" | "ready" | "error"; error?: string }): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = `tiptap-ai-preview tiptap-ai-preview-${args.status}`;
  wrapper.setAttribute("contenteditable", "false");
  wrapper.setAttribute("data-ai-suggestion", "preview");

  const bubble = document.createElement("span");
  bubble.className = "tiptap-ai-preview-bubble";
  if (args.status === "error") {
    bubble.textContent = args.error ?? "AI request failed";
  } else if (args.status === "streaming" && args.buffer.length === 0) {
    bubble.className += " tiptap-ai-preview-bubble-pending";
    bubble.textContent = "Thinking…";
  } else {
    bubble.textContent = args.buffer;
  }
  wrapper.appendChild(bubble);

  const actions = document.createElement("span");
  actions.className = "tiptap-ai-preview-actions";

  const rejectVerb = args.status === "error" ? "dismiss" : args.status === "streaming" ? "cancel" : "reject";
  actions.appendChild(
    createPreviewAction({
      key: "esc",
      verb: rejectVerb,
      action: "reject",
      ariaLabel: `${capitalize(rejectVerb)} AI suggestion (Escape)`,
      extraClass: "tiptap-ai-preview-reject",
    }),
  );

  if (args.status === "ready") {
    const divider = document.createElement("span");
    divider.className = "tiptap-ai-preview-divider";
    divider.setAttribute("aria-hidden", "true");
    divider.textContent = "·";
    actions.appendChild(divider);

    actions.appendChild(
      createPreviewAction({
        key: "⏎",
        verb: "accept",
        action: "accept",
        ariaLabel: "Accept AI suggestion (Enter)",
        extraClass: "tiptap-ai-preview-accept",
      }),
    );
  }

  wrapper.appendChild(actions);
  return wrapper;
}

function createPreviewAction(opts: {
  key: string;
  verb: string;
  action: "accept" | "reject";
  ariaLabel: string;
  extraClass: string;
}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `tiptap-ai-preview-action ${opts.extraClass}`;
  btn.dataset.aiSuggestionAction = opts.action;
  btn.setAttribute("aria-label", opts.ariaLabel);

  const kbd = document.createElement("kbd");
  kbd.className = "tiptap-ai-kbd";
  kbd.textContent = opts.key;
  btn.appendChild(kbd);

  const verbNode = document.createElement("span");
  verbNode.className = "tiptap-ai-preview-verb";
  verbNode.textContent = opts.verb;
  btn.appendChild(verbNode);

  return btn;
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
