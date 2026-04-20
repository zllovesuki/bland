import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import "../styles/ai-suggestion.css";

interface IndicatorState {
  active: { sessionId: string; pos: number; label: string } | null;
  inflight: { sessionId: string } | null;
}

type IndicatorMeta =
  | { type: "begin"; sessionId: string; pos: number; label: string }
  | { type: "hide-indicator"; sessionId: string }
  | { type: "end"; sessionId: string };

export const aiGenerateIndicatorKey = new PluginKey<IndicatorState>("aiGenerateIndicator");

const abortHandlers = new Map<string, () => void>();

export function registerAiGenerateAbort(sessionId: string, handler: () => void): void {
  abortHandlers.set(sessionId, handler);
}

export function unregisterAiGenerateAbort(sessionId: string): void {
  abortHandlers.delete(sessionId);
}

function triggerAiGenerateAbort(sessionId: string): void {
  const handler = abortHandlers.get(sessionId);
  if (handler) handler();
}

export function beginAiGenerate(view: EditorView, pos: number, label = "Generating…"): string {
  const sessionId = createSessionId();
  view.dispatch(
    view.state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId, pos, label } satisfies IndicatorMeta),
  );
  return sessionId;
}

export function hideAiGenerateIndicator(view: EditorView, sessionId: string): void {
  view.dispatch(
    view.state.tr.setMeta(aiGenerateIndicatorKey, { type: "hide-indicator", sessionId } satisfies IndicatorMeta),
  );
}

export function endAiGenerate(view: EditorView, sessionId: string): void {
  view.dispatch(view.state.tr.setMeta(aiGenerateIndicatorKey, { type: "end", sessionId } satisfies IndicatorMeta));
}

export function isAiGenerateInflight(state: EditorState): boolean {
  const plugin = aiGenerateIndicatorKey.getState(state);
  return Boolean(plugin?.inflight);
}

export const AiGenerateIndicator = Extension.create({
  name: "aiGenerateIndicator",

  addProseMirrorPlugins() {
    return [
      new Plugin<IndicatorState>({
        key: aiGenerateIndicatorKey,
        state: {
          init(): IndicatorState {
            return { active: null, inflight: null };
          },
          apply(tr: Transaction, value: IndicatorState): IndicatorState {
            const meta = tr.getMeta(aiGenerateIndicatorKey) as IndicatorMeta | undefined;
            if (meta?.type === "begin") {
              return {
                active: { sessionId: meta.sessionId, pos: meta.pos, label: meta.label },
                inflight: { sessionId: meta.sessionId },
              };
            }
            if (meta?.type === "hide-indicator") {
              if (!value.active || value.active.sessionId !== meta.sessionId) return value;
              return { ...value, active: null };
            }
            if (meta?.type === "end") {
              const active = value.active && value.active.sessionId === meta.sessionId ? null : value.active;
              const inflight = value.inflight && value.inflight.sessionId === meta.sessionId ? null : value.inflight;
              if (active === value.active && inflight === value.inflight) return value;
              return { active, inflight };
            }
            if (!value.active) return value;
            if (tr.docChanged) {
              const pos = tr.mapping.map(value.active.pos, 1);
              return { ...value, active: { ...value.active, pos } };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const plugin = aiGenerateIndicatorKey.getState(state);
            if (!plugin?.active) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(plugin.active.pos, () => renderIndicator(plugin.active!.label), {
                side: 1,
                ignoreSelection: true,
                key: `ai-generate-indicator:${plugin.active.pos}:${plugin.active.label}`,
              }),
            ]);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              const button = target.closest<HTMLButtonElement>('[data-ai-generate-action="cancel"]');
              if (!button) return false;
              event.preventDefault();
              const plugin = aiGenerateIndicatorKey.getState(view.state);
              const sessionId = plugin?.inflight?.sessionId;
              if (sessionId) triggerAiGenerateAbort(sessionId);
              return true;
            },
          },
          handleKeyDown(view, event) {
            if (event.key !== "Escape") return false;
            const plugin = aiGenerateIndicatorKey.getState(view.state);
            const sessionId = plugin?.inflight?.sessionId;
            if (!sessionId) return false;
            triggerAiGenerateAbort(sessionId);
            return true;
          },
        },
      }),
    ];
  },
});

function renderIndicator(label: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "tiptap-ai-generate-indicator";
  el.setAttribute("contenteditable", "false");
  el.setAttribute("aria-live", "polite");

  const dot = document.createElement("span");
  dot.className = "tiptap-ai-generate-indicator-dot";
  el.appendChild(dot);

  const text = document.createElement("span");
  text.className = "tiptap-ai-generate-indicator-label";
  text.textContent = label;
  el.appendChild(text);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "tiptap-ai-generate-cancel";
  cancel.dataset.aiGenerateAction = "cancel";
  cancel.setAttribute("aria-label", "Cancel generation (Escape)");

  const kbd = document.createElement("kbd");
  kbd.className = "tiptap-ai-kbd";
  kbd.textContent = "esc";
  cancel.appendChild(kbd);

  const verb = document.createElement("span");
  verb.className = "tiptap-ai-generate-cancel-verb";
  verb.textContent = "cancel";
  cancel.appendChild(verb);

  el.appendChild(cancel);

  return el;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ai-gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
