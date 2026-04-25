import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  aiGenerateIndicatorKey,
  appendAiGenerateChunk,
  createAiGenerateIndicatorPlugin,
  type AiGenerateSessionSnapshot,
} from "@/client/components/editor/extensions/ai-generate-indicator";

const schema = getSchema([StarterKit.configure({ undoRedo: false })]);

function makeState(): EditorState {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world." }] }],
  });
  return EditorState.create({ schema, doc, plugins: [createAiGenerateIndicatorPlugin()] });
}

function getSession(state: EditorState): AiGenerateSessionSnapshot | null {
  const plugin = aiGenerateIndicatorKey.getState(state);
  if (!plugin?.active) return null;
  const { sessionId, from, to, expectedLength, dirty } = plugin.active;
  return { sessionId, from, to, expectedLength, dirty };
}

describe("AiGenerateIndicator session range", () => {
  it("tracks range advancement on chunk transactions", () => {
    let state = makeState();
    const begin = state.tr.setMeta(aiGenerateIndicatorKey, {
      type: "begin",
      sessionId: "s1",
      pos: 6,
      label: "Generating…",
    });
    state = state.apply(begin);

    const chunk1 = state.tr
      .insertText("AAA", 6)
      .setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" });
    state = state.apply(chunk1);

    let session = getSession(state);
    expect(session).toMatchObject({ from: 6, to: 9, expectedLength: 3, dirty: false });

    const chunk2 = state.tr
      .insertText("BB", 9)
      .setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "BB" });
    state = state.apply(chunk2);

    session = getSession(state);
    expect(session).toMatchObject({ from: 6, to: 11, expectedLength: 5, dirty: false });
  });

  it("maps the range past external edits before the range without flagging dirty", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // External insertion at pos 1 (before the range) — no plugin meta.
    state = state.apply(state.tr.insertText("X", 1));

    const session = getSession(state);
    expect(session).toMatchObject({ from: 7, to: 10, expectedLength: 3, dirty: false });
  });

  it("does not absorb a foreign insertion at exactly the start boundary", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Foreign insertion at exactly `from`. The user's character must stay
    // outside the tracked range so rollback/finalize cannot delete or replace
    // it. Range advances to [7, 10), still length 3, dirty stays false.
    state = state.apply(state.tr.insertText("Y", 6));

    const session = getSession(state);
    expect(session?.from).toBe(7);
    expect(session?.to).toBe(10);
    expect(session?.dirty).toBe(false);
    expect(state.doc.textBetween(session!.from, session!.to)).toBe("AAA");
  });

  it("does not absorb a foreign insertion at exactly the end boundary", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Foreign insertion at exactly `to`. The boundary character must stay
    // outside the tracked range. Range stays [6, 9), dirty stays false.
    state = state.apply(state.tr.insertText("Z", 9));

    const session = getSession(state);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(9);
    expect(session?.dirty).toBe(false);
    expect(state.doc.textBetween(session!.from, session!.to)).toBe("AAA");
  });

  it("does not flag dirty for external edits after the range", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // External insertion at the very end (after the range).
    state = state.apply(state.tr.insertText("Z", state.doc.content.size - 1));

    const session = getSession(state);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(9);
    expect(session?.dirty).toBe(false);
  });

  it("flags dirty when an external edit changes the range length (insert inside)", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // External insertion at pos 7 (inside the AAA range).
    state = state.apply(state.tr.insertText("Y", 7));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    // Range length now 4, expectedLength still 3.
    expect(session && session.to - session.from).toBe(4);
  });

  it("flags dirty when the range collapses to zero", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // External delete that wipes out the entire generated range.
    state = state.apply(state.tr.delete(6, 9));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session && session.to <= session.from).toBe(true);
  });

  it("matrix cell A: left-adjacent non-zero deletion ending exactly at `from` is clean", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // delete([4, 6)) is left-adjacent: oldEnd === from. Strict overlap test
    // excludes it (6 > 6 is false). Range maps to [4, 7) and stays clean.
    state = state.apply(state.tr.delete(4, 6));

    const session = getSession(state);
    expect(session?.from).toBe(4);
    expect(session?.to).toBe(7);
    expect(session?.dirty).toBe(false);
    expect(state.doc.textBetween(session!.from, session!.to)).toBe("AAA");
  });

  it("matrix cell C: deletion crossing the start boundary is dirty", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // delete([5, 7)) crosses the start boundary: oldStart < from < oldEnd.
    // Overlap test fires (7 > 6 && 5 < 9), session goes dirty, range shrinks.
    state = state.apply(state.tr.delete(5, 7));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session?.from).toBe(5);
    expect(session?.to).toBe(7);
  });

  it("matrix cell G: deletion crossing the end boundary is dirty", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // delete([8, 10)) crosses the end boundary: oldStart < to < oldEnd.
    // Overlap test fires (10 > 6 && 8 < 9), session goes dirty, range shrinks.
    state = state.apply(state.tr.delete(8, 10));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(8);
  });

  it("matrix cell I: right-adjacent non-zero deletion starting exactly at `to` is clean", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // delete([9, 11)) is right-adjacent: oldStart === to. Strict overlap test
    // excludes it (9 < 9 is false). Range stays at [6, 9) and clean.
    state = state.apply(state.tr.delete(9, 11));

    const session = getSession(state);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(9);
    expect(session?.dirty).toBe(false);
    expect(state.doc.textBetween(session!.from, session!.to)).toBe("AAA");
  });

  it("chunk meta on a dirty session does not advance `to` or `expectedLength`", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Foreign edit inside the range flips dirty.
    state = state.apply(state.tr.delete(6, 7));
    const beforeSession = getSession(state);
    expect(beforeSession?.dirty).toBe(true);

    // Even if a chunk meta tr reaches apply() while dirty (helper bypassed,
    // alternate dispatch path, etc.), `to` and `expectedLength` must not
    // advance. The invariant disallows new AI text once ownership is
    // unprovable.
    state = state.apply(state.tr.setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "XYZ" }));

    const afterSession = getSession(state);
    expect(afterSession?.dirty).toBe(true);
    expect(afterSession?.to).toBe(beforeSession?.to);
    expect(afterSession?.expectedLength).toBe(beforeSession?.expectedLength);
  });

  it("flags dirty when a deletion partially overlaps the range start", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Delete one character of the range (the first A). Step source [6,7)
    // overlaps [6,9), so dirty must flip on. Range shrinks to [6,8).
    state = state.apply(state.tr.delete(6, 7));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(8);
  });

  it("flags dirty when a deletion partially overlaps the range end", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Delete the last character of the range. Step source [8,9) overlaps
    // [6,9). Range shrinks to [6,8).
    state = state.apply(state.tr.delete(8, 9));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session?.from).toBe(6);
    expect(session?.to).toBe(8);
  });

  it("flags dirty when a same-length replacement lands inside the range", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );

    // Replace the middle "A" with "Y": same total length but the user's edit
    // is inside the generated range. Length-divergence would miss this.
    state = state.apply(state.tr.replaceWith(7, 8, state.schema.text("Y")));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    // Mapped length unchanged (still 3) but the session is dirty.
    expect(session && session.to - session.from).toBe(3);
  });

  it("appendAiGenerateChunk skips dispatch once the session is dirty (collapsed range)", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );
    // External delete collapses the generated range.
    state = state.apply(state.tr.delete(6, 9));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);
    expect(session && session.to <= session.from).toBe(true);

    let dispatched = 0;
    const fakeView = {
      state,
      dispatch: () => {
        dispatched += 1;
      },
    } as unknown as EditorView;

    appendAiGenerateChunk(fakeView, "s1", "should-not-land");
    expect(dispatched).toBe(0);
  });

  it("appendAiGenerateChunk skips dispatch once the session is dirty (length unchanged)", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(
      state.tr.insertText("AAA", 6).setMeta(aiGenerateIndicatorKey, { type: "chunk", sessionId: "s1", text: "AAA" }),
    );
    // Same-length replacement inside the range still flags dirty under the
    // step-walk detector. Subsequent chunks must not land.
    state = state.apply(state.tr.replaceWith(7, 8, state.schema.text("Y")));

    const session = getSession(state);
    expect(session?.dirty).toBe(true);

    let dispatched = 0;
    const fakeView = {
      state,
      dispatch: () => {
        dispatched += 1;
      },
    } as unknown as EditorView;

    appendAiGenerateChunk(fakeView, "s1", "extra");
    expect(dispatched).toBe(0);
  });

  it("clears active session on end", () => {
    let state = makeState();
    state = state.apply(
      state.tr.setMeta(aiGenerateIndicatorKey, { type: "begin", sessionId: "s1", pos: 6, label: "x" }),
    );
    state = state.apply(state.tr.setMeta(aiGenerateIndicatorKey, { type: "end", sessionId: "s1" }));

    expect(getSession(state)).toBeNull();
  });
});
