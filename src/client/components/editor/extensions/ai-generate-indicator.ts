import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import "../styles/ai-suggestion.css";

interface ActiveSession {
  sessionId: string;
  from: number;
  to: number;
  expectedLength: number;
  dirty: boolean;
  label: string;
}

interface IndicatorState {
  active: ActiveSession | null;
  inflight: { sessionId: string } | null;
}

type IndicatorMeta =
  | { type: "begin"; sessionId: string; pos: number; label: string }
  | { type: "chunk"; sessionId: string; text: string }
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

// Inserts the streaming chunk at the plugin's currently-tracked range end and
// stamps the transaction with chunk meta so the plugin's apply() advances `to`
// by exactly text.length without flagging the session dirty.
//
// Once the session is dirty (an external edit landed inside the generated
// range, or the range was deleted/collapsed), bail out: never recreate AI
// content where a collaborator/user has taken over. The text accumulator in
// the controller still advances so the stream can be tracked to completion,
// but no further mutations land in the document.
export function appendAiGenerateChunk(view: EditorView, sessionId: string, text: string): void {
  if (!text) return;
  const session = getAiGenerateSession(view.state);
  if (!session || session.sessionId !== sessionId) return;
  if (session.dirty) return;
  const tr = view.state.tr.insertText(text, session.to);
  tr.setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId, text } satisfies IndicatorMeta);
  view.dispatch(tr);
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

export interface AiGenerateSessionSnapshot {
  sessionId: string;
  from: number;
  to: number;
  expectedLength: number;
  dirty: boolean;
}

export function getAiGenerateSession(state: EditorState): AiGenerateSessionSnapshot | null {
  const plugin = aiGenerateIndicatorKey.getState(state);
  if (!plugin?.active) return null;
  const { sessionId, from, to, expectedLength, dirty } = plugin.active;
  return { sessionId, from, to, expectedLength, dirty };
}

export function createAiGenerateIndicatorPlugin(): Plugin<IndicatorState> {
  return new Plugin<IndicatorState>({
    key: aiGenerateIndicatorKey,
    state: {
      init(): IndicatorState {
        return { active: null, inflight: null };
      },
      apply(tr: Transaction, value: IndicatorState): IndicatorState {
        const meta = tr.getMeta(aiGenerateIndicatorKey) as IndicatorMeta | undefined;
        if (meta?.type === "begin") {
          return {
            active: {
              sessionId: meta.sessionId,
              from: meta.pos,
              to: meta.pos,
              expectedLength: 0,
              dirty: false,
              label: meta.label,
            },
            inflight: { sessionId: meta.sessionId },
          };
        }
        if (meta?.type === "chunk") {
          if (!value.active || value.active.sessionId !== meta.sessionId) return value;
          // Defense in depth: even if a chunk meta tr reaches apply() while
          // the session is dirty (helper guard bypassed, or some other
          // dispatch path), do not advance `to`/`expectedLength`. The
          // invariant requires no AI text be appended once ownership is
          // unprovable.
          if (value.active.dirty) return value;
          const expectedLength = value.active.expectedLength + meta.text.length;
          const to = value.active.to + meta.text.length;
          return {
            ...value,
            active: { ...value.active, to, expectedLength },
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
          // Foreign (non-chunk) doc-changing transaction. Walk each step and
          // check whether its replaced range overlaps the active range in
          // pre-step coordinates; advance the active range through the step's
          // map; repeat. Length-divergence alone misses same-length
          // replacements (select 1 char, type 1 char).
          //
          // Mapping bias is "exclusive" at both ends: from uses +1 so a
          // foreign insertion at exactly `from` keeps the new content
          // OUTSIDE the range (the start advances past it). to uses -1 so a
          // foreign insertion at exactly `to` likewise stays outside (the
          // end stops before it). This matches the strict overlap test
          // (`oldEnd > from && oldStart < to`) which excludes zero-width
          // boundary steps from flagging dirty: range and dirty agree that
          // boundary content is not ours. Chunk transactions bypass this
          // branch via chunk meta, so they still extend the range from `to`.
          //
          // Collapsed mapped ranges count as dirty — never resurrect
          // deleted territory.
          let from = value.active.from;
          let to = value.active.to;
          let dirty = value.active.dirty;
          for (let i = 0; i < tr.steps.length; i++) {
            const stepMap = tr.steps[i].getMap();
            stepMap.forEach((oldStart, oldEnd) => {
              if (oldEnd > from && oldStart < to) dirty = true;
            });
            from = stepMap.map(from, 1);
            to = stepMap.map(to, -1);
          }
          const collapsed = to <= from;
          if (collapsed) dirty = true;
          return {
            ...value,
            active: { ...value.active, from, to: collapsed ? from : to, dirty },
          };
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const plugin = aiGenerateIndicatorKey.getState(state);
        if (!plugin?.active) return null;
        const indicatorPos = plugin.active.to;
        return DecorationSet.create(state.doc, [
          Decoration.widget(indicatorPos, () => renderIndicator(plugin.active!.label), {
            side: 1,
            ignoreSelection: true,
            key: `ai-generate-indicator:${indicatorPos}:${plugin.active.label}`,
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
  });
}

export const AiGenerateIndicator = Extension.create({
  name: "aiGenerateIndicator",

  addProseMirrorPlugins() {
    return [createAiGenerateIndicatorPlugin()];
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
