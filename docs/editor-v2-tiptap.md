# Editor V2 Tiptap Plan

## Purpose

This document is a single execution plan for replacing the current BlockNote-based editor in `bland` with Tiptap.

This merged plan assumes:

- License pressure is the primary reason for the replacement.
- Data migration is out of scope.
- D1 `doc_snapshots` data and local IndexedDB editor state can be wiped.
- Churn is acceptable for this work.
- The migration should preserve the live product contract, not just the current visual style.

## Decision Summary

- Keep the public `EditorPane` API stable so `page-view.tsx` and `shared-page-view.tsx` do not need broad changes.
- Keep the current collaborative split:
  - body content in `YJS_DOCUMENT_STORE` as `Y.XmlFragment`
  - title in `YJS_PAGE_TITLE` as `Y.Text`
- Keep `Y.Doc`, `IndexeddbPersistence`, `y-partyserver/provider`, and the `onProvider` callback contract.
- Make a Phase 0 compatibility spike mandatory before the broader rewrite.
- Treat slash menu, formatting toolbar, link toolbar, upload wiring, and shared-media resolution as cutover-scope parity, not optional polish.
- Keep code blocks in cutover scope, including the existing allowed language set and syntax highlighting. Prefer a Shiki-backed implementation, but allow a fallback if the preferred package proves unstable.
- Treat drag handle behavior as confirm-first and non-blocking. It can land after cutover if needed.
- Treat `tiptap-ui-components` as a fallback accelerator, not the default path.
- Remove BlockNote-specific dependencies, overrides, and CSS once the Tiptap implementation passes parity checks.

## Current Editor Surface To Preserve

The replacement must preserve the behaviors already wired into the live tree:

- collaborative body content stored in `YJS_DOCUMENT_STORE`
- collaborative title stored separately in `YJS_PAGE_TITLE`
- IndexedDB persistence keyed by page id
- `y-partyserver/provider` auth and share-token connection params
- provider awareness for presence and sync UI outside the editor
- read-only shared-page mode
- upload flow through `src/client/lib/uploads.ts`
- share-token-aware media rendering for shared pages
- provider custom messages used for page metadata refresh
- code blocks with the current allowed language list

Primary live integration points:

- `src/client/components/editor/editor-pane.tsx`
- `src/client/components/editor/controllers/formatting-toolbar.tsx`
- `src/client/components/editor/controllers/link-toolbar.tsx`
- `src/client/components/editor/controllers/suggestion-menu.tsx`
- `src/client/components/editor/controllers/placement.ts`
- `src/client/components/page-view.tsx`
- `src/client/components/shared-page-view.tsx`
- `src/client/lib/uploads.ts`
- `src/client/hooks/use-sync.ts`
- `src/shared/constants.ts`
- `src/shared/doc-messages.ts`
- `src/client/styles/app.css`
- `src/client/styles/custom.css`

## Explicit Non-Goals

- preserving BlockNote document compatibility
- preserving BlockNote-specific schema or JSON output
- matching BlockNote DOM structure or CSS class names
- reworking the worker-side DocSync model
- changing upload routes, auth flow, or shared types unless the migration requires it

## Phase Plan

## Phase 0: Compatibility Spike

Goal: verify the collaboration stack and provider contract before broader UI work.

Tasks:

- install the minimum Tiptap packages needed for a spike
- mount a temporary Tiptap editor body in place of BlockNote on one page
- bind Tiptap collaboration to the existing `Y.Doc` and `YJS_DOCUMENT_STORE` fragment
- verify `@tiptap/extension-collaboration-caret` works with `y-partyserver/provider` awareness
- verify the same provider awareness still drives the existing avatar stack
- verify remote cursor rendering and awareness updates use a compatible user shape
- verify page switch teardown does not leak providers or awareness state
- verify read-only shared-page rendering still works with the same `shareToken` flow

Exit criteria:

- multi-tab editing syncs through the existing provider
- remote cursors render correctly
- existing presence UI still works from the same `provider.awareness`
- no duplicate awareness clients appear after page switches
- shared-page read-only render works without BlockNote

If Phase 0 fails, stop and resolve the provider or extension mismatch before proceeding.

## Phase 1: Core Swap

Goal: replace the editor body while preserving the collaboration, title, and provider lifecycle contracts.

Tasks:

- rewrite the BlockNote-backed body editor as a Tiptap-backed body editor
- keep the exported `EditorPane` component name and prop contract unchanged
- keep title management in the existing textarea flow
- keep `Y.Doc` bootstrap, title observer, title seeding, provider setup, and teardown logic
- keep `IndexeddbPersistence` with `bland:doc:${pageId}`
- keep `onProvider` behavior unchanged so sync status and presence UI continue to work
- configure Tiptap collaboration against the existing `YJS_DOCUMENT_STORE` fragment
- support `readOnly` with `editable: false`
- add basic content styling so the editor is readable before parity UI lands

Exit criteria:

- authenticated page editing works with Tiptap
- title sync still works through `YJS_PAGE_TITLE`
- `onProvider` still drives existing sync and presence UI
- shared read-only pages still render correctly
- page remount and teardown behavior remains correct

This phase is not the cutover gate by itself. Do not remove BlockNote yet.

## Phase 2: Controller Parity

Goal: restore the editor controls that are part of the current live editor surface.

Tasks:

- rebuild the slash menu against Tiptap APIs
- gate slash-menu visibility with `shouldShow` and `isChangeOrigin(transaction)` so it only opens for the local editor change in collaborative sessions
- rebuild the floating formatting toolbar against Tiptap APIs
- rebuild the link toolbar against Tiptap APIs
- wire image upload through the existing `uploadFile(workspaceId, file, pageId, shareToken)` flow
- support paste and drag/drop image upload
- preserve share-token-aware media rendering for shared pages
- keep read-only mode from exposing editing or upload actions
- preserve the current floating placement behavior by reusing `placement.ts`

Exit criteria:

- slash menu works with keyboard and mouse
- formatting toolbar appears on selection and applies marks correctly
- link toolbar supports edit, remove, and open behavior
- image upload works in authenticated pages
- uploaded media render correctly in shared pages
- no auth-only media URLs leak into shared-page rendering

Phase 2 restores controller parity, but cutover is not complete until Phase 3 code block parity and cleanup also pass validation.

## Phase 3: Extensions And Polish

Goal: finish the remaining editor-specific parity work, remove BlockNote, and clean up the tree.

Tasks:

- implement code blocks with the current language parity
- prefer a Shiki-backed path for highlighting
- allow a maintained fallback if the preferred Shiki package proves incompatible
- keep the current allowed language list centralized and explicit
- remove BlockNote dependencies from `package.json`
- delete `bn-components.tsx`
- remove BlockNote-only controllers, imports, and CSS
- remove `@source "../../../node_modules/@blocknote/shadcn";` from `src/client/styles/app.css`
- replace `.bn-*` styling with `.tiptap` and related editor styles
- wipe D1 `doc_snapshots` and validate fresh-document behavior

Exit criteria:

- BlockNote packages and imports are gone
- the editor still passes collaboration, upload, and shared-page checks
- code blocks remain editable and render with acceptable highlighting
- typecheck and build pass

## Drag Handle Policy

Drag handle behavior is not a cutover gate.

- If `@tiptap/extension-drag-handle-react` fits cleanly, it can land during or after Phase 3.
- If it introduces instability or extra churn, defer it to a follow-up.
- Shipping without it is acceptable as long as the rest of editor parity is in place.

## File Strategy

Prefer the smallest file churn that keeps ownership clear.

Recommended approach:

- keep `src/client/components/editor/editor-pane.tsx` as the public entry point
- rewrite `editor-pane.tsx` in place unless a thin wrapper around a new Tiptap implementation is clearly cleaner
- keep `controllers/placement.ts` unchanged
- rewrite the current controller files in place unless splitting a helper out materially improves clarity
- add new files only when they clearly earn their keep

Likely file outcomes:

- rewrite `src/client/components/editor/editor-pane.tsx`
- rewrite `src/client/components/editor/controllers/formatting-toolbar.tsx`
- rewrite `src/client/components/editor/controllers/link-toolbar.tsx`
- rewrite `src/client/components/editor/controllers/suggestion-menu.tsx`
- delete `src/client/components/editor/bn-components.tsx`
- update `src/client/styles/app.css`
- update `src/client/styles/custom.css`

Possible new files if needed:

- `src/client/components/editor/extensions/slash-menu.ts`
- `src/client/components/editor/controllers/slash-items.ts`
- `src/client/components/editor/views/code-block-view.tsx`
- `src/client/components/editor/views/image-view.tsx`

Do not create a larger `tiptap/` subtree by default. Add structure only if the implementation actually needs it.

## Dependency Strategy

Use the latest stable Tiptap 3 release and keep every `@tiptap/*` package on the same version.

### Required Core

- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/y-tiptap`
- `@tiptap/starter-kit`
- `@tiptap/extension-collaboration`
- `@tiptap/extension-collaboration-caret`
- `@tiptap/extension-image`
- `@tiptap/extension-placeholder`

### Required For Parity

- `@tiptap/extension-file-handler`
- `@tiptap/suggestion`
- a code block extension path with acceptable highlighting

### Likely Needed

- `@tiptap/extension-task-list`
- `@tiptap/extension-task-item`

### Confirm-First

- table support
- drag handle support
- `tiptap-ui-components`

### Remove

- `@blocknote/core`
- `@blocknote/react`
- `@blocknote/shadcn`
- BlockNote-only transitive UI dependencies that are no longer referenced

Dependency note:

`@radix-ui/react-popover` is currently only referenced by the BlockNote override file. It is not a required keeper for the Tiptap migration. If the new editor UI does not use it directly, it should leave with BlockNote.

## Implementation Notes

### Tiptap Configuration Direction

Use a Tiptap configuration that mirrors the existing collaboration contract:

- `StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } })`
- `Collaboration.configure({ fragment: ydoc.getXmlFragment(YJS_DOCUMENT_STORE) })`
- `CollaborationCaret.configure({ provider, user })`
- `Image.configure({ inline: false, allowBase64: false })`
- `Placeholder.configure(...)`

History must stay disabled when Yjs collaboration is enabled.

`Link` and `Underline` already come from `StarterKit` in Tiptap 3. Configure them through `StarterKit.configure(...)` instead of adding standalone extensions unless the implementation has a specific reason to split them out.

### React Integration Direction

Preferred default:

- use Tiptap's React Composable API for the new editor shell
- create the editor instance with `useEditor`
- render through `<Tiptap instance={editor}>`
- let child UI read the editor through `useTiptap()` or `useTiptapState()` instead of prop drilling where that improves clarity

Fallback:

- use `useEditor` with direct `EditorContent` wiring if that keeps `EditorPane` materially simpler in this codebase

The composable API is the preferred React pattern for this migration, but it is not a hard requirement.

### Controller Strategy

Default path:

- rebuild the current controllers against Tiptap APIs
- keep using `@floating-ui/react` and the existing placement helpers

Fallback:

- if rebuilding a controller turns out to be materially more complex than expected, vendor only the minimum `tiptap-ui-components` pieces needed to finish the migration

Do not default to vendoring a large Tiptap UI template.

### Upload And Shared-Media Strategy

Keep the backend flow unchanged.

Client requirements:

- call the existing `uploadFile()` helper
- insert uploaded images into the Tiptap document
- disable upload entry points in read-only mode
- preserve share-token-aware media rendering

Preferred rendering strategy:

- use a small custom Image NodeView if runtime share-token resolution is needed

Alternative:

- normalize URLs at insertion time only if it proves clearly simpler and token behavior remains acceptable

### Code Block Strategy

Code blocks stay in cutover scope.

Requirements:

- keep the current allowed language list
- preserve insertion and editing
- provide acceptable syntax highlighting
- keep the language selector behavior or an equivalent explicit language choice

Preferred path:

- Shiki-backed highlighting

Acceptable fallback:

- a maintained non-Shiki code block extension if it keeps language parity and avoids blocking the migration

Package choice is an implementation detail. Language parity is the actual requirement.

## Document Schema Direction

The Tiptap extension set is the effective schema for the editor. For this migration, keep that schema narrow and semantic.

Storage model:

- keep title in `YJS_PAGE_TITLE` as `Y.Text`
- keep body in `YJS_DOCUMENT_STORE` as `Y.XmlFragment`
- keep Yjs as the only collaborative source of truth for live document state
- treat JSON and HTML as import/export formats, not the mergeable canonical store

Schema rules:

- use a small set of typed nodes and marks
- do not add a generic `block` node with `kind: string`
- do not use `data: Record<string, unknown>` attr bags
- do not persist runtime or UI state in the document
- add new semantics as new nodes or marks, not opaque attrs on unrelated nodes

Body document shape:

```ts
doc: block+

paragraph
  attrs: { id?: string }
  content: inline*

heading
  attrs: { id?: string; level: 1 | 2 | 3 }
  content: inline*

blockquote
  attrs: { id?: string }
  content: block+

bulletList
  attrs: { id?: string }
  content: listItem+

orderedList
  attrs: { id?: string; start?: number }
  content: listItem+

listItem
  content: paragraph block*

taskList
  attrs: { id?: string }
  content: taskItem+

taskItem
  attrs: { checked: boolean }
  content: paragraph block*

horizontalRule
  attrs: { id?: string }
  atom: true
  group: block

codeBlock
  attrs: { id?: string; language: AllowedCodeLanguage | null }
  content: text*

image
  attrs: { id?: string; src: string; alt?: string | null; title?: string | null }
  atom: true
  group: block

text

hardBreak
  inline: true
  atom: true

marks:
  bold
  italic
  underline
  strike
  code
  link { href: string }
```

Schema decisions for this migration:

- task lists are in cutover scope
- code blocks persist only raw text plus `language`
- links persist only `href`
- uploaded images persist a stable `/uploads/:id` style path in `src`
- share-token-aware image resolution remains a render concern, not stored content
- `intrinsicWidth` and `intrinsicHeight` are deferred until the upload flow actually captures them

Image node decision:

- use the standard Tiptap image node shape for the migration
- do not introduce a custom `assetImage` node in the initial cutover
- revisit a custom asset node only if we need additional asset semantics such as captions, richer metadata, reuse tracking, or server-driven node targeting

Code block rules:

- keep the language allowlist centralized and explicit
- enforce the allowlist in editor commands, picker UI, import/paste handling, and tests
- do not persist highlighted token output, spans, or other derived render state

Stable block IDs:

- IDs are useful for anchors, comments, analytics, and drag/drop references
- do not make `UniqueID` a hard migration requirement
- add it only when there is a concrete consumer for those IDs
- if added, scope it to real block nodes and configure it for collaboration-safe transaction filtering

## CSS Migration Notes

Remove:

- BlockNote CSS import from the editor
- BlockNote `@source` wiring from `src/client/styles/app.css`
- `.bn-*` selectors and BlockNote-specific theme variables from `src/client/styles/custom.css`

Add:

- `.tiptap` content styling
- placeholder styling
- toolbar and menu styling
- collaboration cursor styling
- code block styling
- image and link styling

Keep:

- existing typography, spacing, and dark theme conventions where they still fit the rest of `bland`

## Validation Plan

### Automated

- `npm run typecheck`
- `npm run build`

### Manual

- edit a page in authenticated mode
- open the same page in a second tab and confirm collaboration
- confirm remote cursors render
- confirm remote presence avatars still show
- confirm sync status still works
- confirm title changes still sync
- reload and confirm IndexedDB restoration works
- switch between pages and confirm old providers are torn down
- open a shared page and confirm read-only render
- upload an image in authenticated mode
- render that image in shared mode
- verify slash menu, formatting toolbar, and link toolbar behavior
- verify code blocks render, remain editable, and preserve language choice

## Acceptance Checklist

- `EditorPane` prop contract remains unchanged
- title remains collaborative through `YJS_PAGE_TITLE`
- body collaboration works through the existing DocSync transport
- provider awareness still drives avatar and cursor presence
- uploads still use existing worker endpoints
- shared uploaded media still render
- read-only shared pages still behave correctly
- code blocks preserve acceptable language and highlighting parity
- BlockNote packages and imports are removed
- typecheck passes
- build passes

## Open Decisions

Decide early, but do not let these block Phase 0:

- whether task lists are required for cutover
- whether table support is required for cutover
- which code block package is the preferred implementation
- whether a custom Image NodeView is needed or simple URL normalization is sufficient
- whether any controller should use vendored `tiptap-ui-components` instead of custom implementation

## Recommended Execution Order

1. Complete Phase 0 and resolve any provider or awareness mismatch.
2. Land the Phase 1 core swap without deleting BlockNote yet.
3. Restore Phase 2 controller parity and shared-media behavior.
4. Finish Phase 3 code block parity and cleanup.
5. Remove BlockNote only after the Tiptap implementation passes validation.

This keeps the migration risk-ordered without redefining the live editor surface as optional.
