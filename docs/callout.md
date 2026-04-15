# Callout Implementation Path

Date: 2026-04-15

## Context

This note proposes the smallest correct implementation path for adding Callout
blocks to bland's live Tiptap editor.

Relevant context:

- bland already ships a custom Tiptap editor, not BlockNote.
- bland stores collaborative document state in Yjs, not Markdown.
- the product spec already lists callouts as part of the intended editor
  surface.

Relevant source:

- [docs/bland-production-spec.md](./bland-production-spec.md)
- [src/client/components/editor/extensions/create-editor-extensions.ts](../src/client/components/editor/extensions/create-editor-extensions.ts)
- [src/client/components/editor/extensions/details-block.tsx](../src/client/components/editor/extensions/details-block.tsx)
- [src/client/components/editor/controllers/details-block.ts](../src/client/components/editor/controllers/details-block.ts)
- [src/client/components/editor/controllers/slash-items.ts](../src/client/components/editor/controllers/slash-items.ts)
- [src/client/components/editor/lib/top-level-blocks.ts](../src/client/components/editor/lib/top-level-blocks.ts)
- [src/client/components/editor/editor-body.tsx](../src/client/components/editor/editor-body.tsx)
- [src/client/components/editor/extensions/code-block/view.tsx](../src/client/components/editor/extensions/code-block/view.tsx)
- [src/worker/lib/yjs-text.ts](../src/worker/lib/yjs-text.ts)
- [docs/editor-export-markdown-pdf.md](./editor-export-markdown-pdf.md)

External references:

- GitHub discussion: <https://github.com/ueberdosis/tiptap/discussions/7483>
- Tiptap docs, Details extension: <https://tiptap.dev/docs/editor/extensions/nodes/details>
- Tiptap docs, Admonition guide:
  <https://tiptap.dev/docs/editor/markdown/guides/create-a-admonition-block>

## What The References Actually Say

### GitHub discussion `#7483`

As of April 15, 2026, the discussion is still unanswered. It is useful as
problem framing only, not as implementation guidance.

### Tiptap docs

The actionable guidance comes from Tiptap's own extension model:

- custom block nodes are the intended way to model callout/admonition UI
- block content should live inside the node itself, not in an external sidecar
- if Markdown import/export is ever needed, Tiptap expects custom parse/render
  logic on the node rather than raw JSX tags stored as the primary document
  format

### BlockNote

BlockNote can be used as product-shape inspiration only:

- discrete callout types
- a visible icon or accent
- slash-menu insertion

bland should not copy BlockNote's custom block implementation model. The live
editor architecture is Tiptap/Yjs, and the feature should fit that architecture
directly.

## Decision Summary

- Add Callout as a native Tiptap block node named `callout`.
- Store Callout in the Yjs document as normal editor content, not as Markdown,
  JSX, or opaque HTML strings.
- Keep the stored node minimal: one block container with block content and a
  constrained `kind` attribute.
- Make Callout a React node view from the start.
- Put kind selection in block-local chrome rendered by the node view.
- Ship slash-menu insertion in v1.
- Do not make a custom header/title subnode in v1.
- Keep worker changes out of the MVP unless a real gap appears.
- Treat Markdown syntax as an export/import concern for later, not as the live
  persistence format.

## Why This Fits bland

bland's current editor extension surface is assembled in
[create-editor-extensions.ts](../src/client/components/editor/extensions/create-editor-extensions.ts).
Custom blocks already exist in the live tree:

- `details` is a custom container block integrated into the schema and slash
  menu
- code blocks use a dedicated node view when richer block-local UI is needed
- top-level block drag/drop relies on an explicit allowlist

That means Callout fits the current architecture as another first-class block
node. It does not require a new editor framework, a Markdown-first storage
model, or Worker-side schema changes.

## Proposed Document Model

The initial node should look like this conceptually:

```ts
type CalloutKind = "info" | "tip" | "warning" | "success";

type CalloutAttrs = {
  kind: CalloutKind;
  bid?: string | null;
};
```

Suggested Tiptap shape:

```ts
Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
});
```

Suggested HTML shape:

```html
<div data-callout data-callout-kind="info">
  <p>Content</p>
</div>
```

Notes:

- `content: "block+"` keeps the block flexible and future-proof.
- `isolating: true` matches the expected editing boundary for a container block.
- `kind` should be a constrained enum, not free text.
- `bid` should come from the existing top-level block identity extension rather
  than a Callout-specific mechanism.
- stored HTML should stay minimal even if the live editor uses a richer React
  node view
- the node-view chrome should be presentational and non-editable, not part of
  the persisted document structure

## Recommended MVP

### Scope

Ship a styled container block with:

- one `kind` attribute with in-block selection
- nested block content
- slash-menu insertion
- React node view chrome for changing the kind
- top-level drag/drop support
- read-only rendering in shared pages

Do not include in the first pass:

- freeform custom icons per block
- editable titles
- Markdown import/export
- toolbar conversion from paragraph to callout

### Why This Is The Right First Slice

This is the smallest implementation that:

- matches bland's current editor model
- satisfies the product need for callouts
- avoids painting the feature into a corner
- keeps future richer UX open

The main structural costs worth paying now are:

- introducing the real `callout` node
- introducing a React node view so users can actually change the `kind`

Both are necessary. Anything beyond that should stay intentionally small.

## Implementation Path

### Phase 1: Add The Block And Node View

Create a new focused extension module, for example:

- `src/client/components/editor/extensions/callout.ts`
- `src/client/components/editor/extensions/callout-view.tsx`

The extension should:

- define the `callout` node
- parse `div[data-callout]`
- render `div[data-callout][data-callout-kind]`
- expose a `kind` attribute with a safe default such as `info`
- register a React node view with `ReactNodeViewRenderer(CalloutView)`

Add a small controller helper, for example:

- `src/client/components/editor/controllers/callout.ts`

That helper should:

- create the JSON content for a new callout block
- insert a callout at a slash-menu range
- place the caret inside the first paragraph after insertion

This should follow the same pattern as the current details insertion helper in
[details-block.ts](../src/client/components/editor/controllers/details-block.ts),
but without copying its summary/content-child complexity.

The React node view should follow the same broad shape as the existing block
views in bland:

- `NodeViewWrapper` for the outer shell
- `NodeViewContent` for the editable body
- non-editable block chrome with `contentEditable={false}`

### Phase 2: Build The Kind Selector UX

The node view should make kind selection a first-class block-local action.

Recommended shape:

- a compact button or pill in the callout chrome that shows the current kind
- a floating menu or popover with the allowed kinds
- one menu item per kind, using `role="menuitemradio"`

Reuse existing bland patterns instead of inventing new menu infrastructure:

- `useEditorPopover` from
  [menu/popover.tsx](../src/client/components/editor/controllers/menu/popover.tsx)
- `preserveEditorSelectionOnMouseDown` from the same module
- `FloatingPortal` as already used by the code block language menu
- `useEditorRuntime()` to gate interactions in read-only mode

The menu action should call `updateAttributes({ kind })`.

That keeps kind changes inside the normal ProseMirror transaction flow, so they
replicate through Yjs like other document edits.

### Phase 3: Register It In The Live Editor

Update
[create-editor-extensions.ts](../src/client/components/editor/extensions/create-editor-extensions.ts)
to register the new extension near the other block nodes.

Add a slash-menu item in
[slash-items.ts](../src/client/components/editor/controllers/slash-items.ts)
with aliases such as:

- `callout`
- `note`
- `tip`
- `warning`

The command should insert a default callout node, ideally `info` or `tip`.

### Phase 4: Make It A First-Class Top-Level Block

Add `"callout"` to the top-level movable node allowlist in
[top-level-blocks.ts](../src/client/components/editor/lib/top-level-blocks.ts).

This is required so the existing block identity and drag/drop features treat
callouts like other top-level blocks.

Without this step:

- callouts would not receive stable `bid` attrs
- block move/delete affordances would drift from the rest of the editor

### Phase 5: Style It

Add a focused stylesheet, for example:

- `src/client/components/editor/styles/callout.css`

Import it from
[editor-body.tsx](../src/client/components/editor/editor-body.tsx).

The first pass should style:

- container background
- border or accent rail
- kind button or pill chrome
- spacing around nested content
- per-kind variants

The style should stay aligned with bland's current visual system and should not
introduce a generic docs-site admonition aesthetic that clashes with the rest
of the product.

Important styling rule:

- the editable content surface should remain visually stable when the kind
  picker is hidden or disabled in read-only mode

### Phase 6: Validate Shared And Read-Only Rendering

Because both editable and shared surfaces render through the same editor
extension stack, Callout should render in:

- authenticated page view
- shared read-only page view

This needs explicit verification, not assumption.

The live editor already fails closed on schema mismatches in
[editor-body.tsx](../src/client/components/editor/editor-body.tsx), so rolling
out a new node must be treated as a schema change that affects all readers.

## What Does Not Need To Change For MVP

### Worker search indexing

[yjs-text.ts](../src/worker/lib/yjs-text.ts) already walks nested XML text
nodes generically. A normal block container should contribute text to search
without Callout-specific Worker logic.

### Shared types

No API contract or Worker route changes are required for the editor-only MVP.
The feature lives entirely inside the collaborative document schema.

### Durable Objects

DocSync snapshot persistence is schema-agnostic at this level. No DO-local
schema change should be required.

## Collaboration Safety

The proposal is collaboration-safe if the implementation keeps a strict split
between shared document state and local UI state.

### Shared State

These values must live in the document and sync through Yjs:

- callout body content
- `kind`
- `bid`

Changes to these values must go through normal ProseMirror transactions.

For `kind`, that means the picker must call `updateAttributes({ kind })`
instead of mutating DOM classes or storing the selected kind only in React
state.

### Local UI State

These values should stay local to the node view and must not be persisted:

- whether the kind menu is open
- which menu item is currently focused
- transient hover and pressed states

This is the same pattern already used by the code block language picker:
document attrs are shared, menu visibility is local UI state.

### Required Implementation Rule

The rendered callout kind must always be derived from `node.attrs.kind`, not
from a duplicated `useState` copy.

Reason:

- if another client changes the kind, the local node view must rerender from
  the updated node attrs
- mirroring `kind` into local state creates stale UI risk during remote edits

Safe pattern:

```tsx
const kind = node.attrs.kind as CalloutKind;
const [open, setOpen] = useState(false);
```

Unsafe pattern:

```tsx
const [kind, setKind] = useState(node.attrs.kind as CalloutKind);
```

### DOM And Selection Rules

To stay collaboration-safe, the node view should:

- keep block chrome outside the editable body
- mark chrome controls `contentEditable={false}`
- use `preserveEditorSelectionOnMouseDown` for the floating kind menu
- avoid direct DOM mutations that try to bypass ProseMirror transactions

That keeps local UI from fighting remote document updates.

### Structural Safety

Adding `callout` to the top-level movable block list is not just a UX detail.
It is part of collaboration safety in bland because:

- top-level `bid` normalization depends on the movable-node allowlist
- block drag/drop reconciliation tracks blocks by stable `bid`
- remote structure changes cancel stale drag state when top-level signatures
  diverge

If `callout` is omitted from that allowlist, concurrent drag/move behavior
would be weaker and less predictable than for the existing top-level blocks.

### Rollout Safety

`callout` is a schema change. bland already fails closed on collaborative schema
mismatches in
[editor-body.tsx](../src/client/components/editor/editor-body.tsx).

That means:

- new clients are safe to collaborate with each other on callout documents
- old clients should become read-only instead of writing corrupt data back

This is collaboration-safe, but it is still a deployment concern. All actively
used clients should receive the new schema before the feature is broadly
introduced.

## React Node View: Required

### Recommendation

Start with a React node view.

### Reason

The user requirement is that Callout kind must be selectable. In bland, that is
best implemented as block-local chrome attached to the block itself.

A plain rendered node would force one of the weaker alternatives:

- deleting and reinserting the block to change kind
- adding a separate toolbar conversion path before the feature is useful
- putting interactive UI directly in persisted content markup

The React node view avoids those problems while keeping the stored node simple.

### Implementation Notes

Follow the established node-view pattern already used in
[code-block/view.tsx](../src/client/components/editor/extensions/code-block/view.tsx),
where block-local UI lives outside the editable content and respects read-only
mode.

The Callout node view should:

- render the outer shell with `NodeViewWrapper`
- render the editable body with `NodeViewContent`
- keep the kind trigger button `contentEditable={false}`
- read `readOnly` from `useEditorRuntime()`
- suppress the kind menu entirely, or disable the trigger, in read-only mode

The kind selector should update only the node attr. It should not rewrite the
content subtree.

## Details Reuse: Why Not

The current `details` block is not the right base for Callout.

Reasons:

- `details` is semantically a disclosure block with persistent open/closed
  state
- it has a two-part internal structure: summary plus content
- it carries custom keyboard and selection handling that Callout does not need

Callout is a simpler block:

- one container
- one kind attribute
- normal nested block content

Reusing `details` would make the design smaller on paper but weaker in
practice. It would import the wrong semantics and extra behavior.

## Markdown Strategy

bland should not store Callout as Markdown or JSX-like tags in the live
document.

Current bland architecture, documented in
[editor-export-markdown-pdf.md](./editor-export-markdown-pdf.md), already
treats Markdown as a later export/import concern.

If bland adds Markdown import/export later, the recommended mapping is:

- internal node: `callout`
- Markdown form: directive-style syntax such as `:::warning`

That aligns with Tiptap's admonition guidance and avoids storing raw component
tags in the source document.

## File Plan

Likely files for the MVP:

- new: `src/client/components/editor/extensions/callout.ts`
- new: `src/client/components/editor/extensions/callout-view.tsx`
- new: `src/client/components/editor/controllers/callout.ts`
- new: `src/client/components/editor/styles/callout.css`
- update: `src/client/components/editor/extensions/create-editor-extensions.ts`
- update: `src/client/components/editor/controllers/slash-items.ts`
- update: `src/client/components/editor/lib/top-level-blocks.ts`
- update: `src/client/components/editor/editor-body.tsx`

## Validation Checklist

For the MVP implementation, validate all of the following:

- slash-menu insertion creates a callout and places the caret inside it
- the kind picker changes `kind` in place without disturbing body content
- kind changes sync between two live clients
- nested paragraphs, lists, and code blocks work inside the callout
- top-level drag handle can move and delete a callout block
- read-only shared pages render callouts correctly
- read-only shared pages do not expose an editable kind selector
- kind persists after reload and reconnect
- search indexing still captures callout text
- `npm run typecheck` passes
- `npm run build` passes

## Recommended Follow-Ups

These are reasonable follow-ups, not MVP requirements:

1. Formatting-toolbar support for converting an existing paragraph into a
   callout.
2. Optional custom icon override beyond the built-in per-kind chrome.
3. Keyboard shortcuts or quick actions for cycling kinds.
4. Markdown import/export mapping using Tiptap's Markdown extension APIs.

## Final Recommendation

Implement Callout as a native Tiptap block container with a constrained `kind`
attribute, normal nested block content, and a React node view for in-place kind
selection.

That is the smallest correct implementation for bland:

- it fits the current editor architecture
- it avoids copying BlockNote's implementation model
- it satisfies the requirement that the kind be selectable without inventing a
  second UI path
- it keeps future Markdown support possible
- it keeps the Worker and storage model unchanged for the MVP

The structural costs worth paying now are adding the real `callout` node and
the React node view needed to edit its `kind`. The rest should stay
deliberately small until the product needs more.
