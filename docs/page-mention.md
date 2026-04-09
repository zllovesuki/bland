# Page Mention Spec

## Purpose

Support mentioning another page inside the Tiptap editor with the smallest implementation that fits the live tree.

This spec is for page mentions, not arbitrary text-to-page links. v1 should ship an atomic inline page reference and leave richer internal-link editing for later.

## Goals

- Let editors insert a reference to another page in the same workspace.
- Render page mentions as first-class inline chips, not raw URLs.
- Keep the stored document value stable across page renames by using `pageId` as the canonical reference.
- Reuse the current access model for members, guests, and shared-link viewers.
- Avoid leaking hidden page titles through the document payload itself.

## Non-Goals

- Arbitrary selected-text internal links.
- Inserting page mentions from `/s/:token` editors.
- Real-time page-title propagation across all open documents.
- Search-index parity for page mentions in v1.
- Resolving or discovering other share tokens for mentioned pages.

## Decision Summary

- Represent a page mention as an inline atomic node named `pageMention`.
- Store only the target `pageId` in the document.
- Insert page mentions with a `[[` suggestion flow in editors that are not running under a share token.
- Reserve bare `@` for future user mentions.
- Disable page-mention insertion when the editor is running under a share token.
- Render mentions from current access, not from stored labels.
- In `/s/:token`, allow broader rendering for logged-in full workspace members. bland does not need strict token-only rendering for members.

## Document Model

The Yjs/Tiptap document should store:

```ts
type PageMentionAttrs = {
  pageId: string;
};
```

It should not store:

- target page title
- target page icon
- workspace slug
- share token

Reason:

- `pageId` is stable across rename and move operations.
- Storing title in the node would leak restricted titles to shared-link viewers because the Yjs payload is delivered before any UI-level access filtering.

## Editor Behavior

### Insertion

Page mention insertion is enabled only when all of the following are true:

- the editor is editable
- `workspaceId` is available
- `shareToken` is not present

This means insertion is available in:

- normal workspace editors
- canonical `/$workspaceSlug/$pageId` editors, including canonical `"shared"` access mode when no `shareToken` is present

Insertion is not available in `/s/:token` editors.

### Trigger

v1 should not claim bare `@` for page mentions.

Reserve `@` for future user mentions.

v1 page mention insertion should support:

- `[[` as the primary typed trigger
- a slash-menu item such as `Link page` or `Mention page` as the explicit insertion action

The suggestion list should:

- filter against visible pages only
- exclude the current page
- prefer the already-loaded workspace page list over network search

The current workspace page list is already the right source for v1:

- full members have all workspace pages loaded
- guest and non-member canonical views already receive only visible pages

Reason:

- page references are structurally closer to wiki links than people mentions
- using bare `@` for pages would block or complicate future user-mention support
- `[[` keeps page references distinct without changing the stored node shape

### Editing Existing Mentions

v1 does not need a retarget UI.

Editing behavior:

- mention nodes are atomic
- backspace/delete removes the whole mention
- changing the target is done by deleting and reinserting

## Rendering

### Visual Form

Render page mentions as inline chips with:

- optional icon when accessible
- title text when accessible
- muted `Restricted` label when inaccessible

Mentions should visually read as internal references, not external links.

### Accessible Mention

When the viewer can resolve the target page, render:

- current page title
- current page icon if available
- clickable navigation target

### Inaccessible Mention

When the viewer cannot resolve the target page, render:

- `Restricted`
- no title
- no icon
- no navigation action

This matches the existing no-title-leak pattern already used for inaccessible ancestors.

## Access Resolution

Page mentions should reuse the live permission model.

The effective rule is:

- access inherits downward from the nearest shared ancestor
- the nearest shared ancestor replaces higher ancestors
- a different share token on the target page does not help unless the viewer is actually using that token

### Canonical Workspace Views

On canonical routes such as `/$workspaceSlug/$pageId`, resolve mentions using the normal authenticated user principal.

Outcomes:

- owner/admin/member can resolve any page in the workspace
- guests can resolve only pages they can already access
- non-members on canonical page routes can resolve only pages they already have access to

### Shared-Link Views

On `/s/:token`, resolve mentions with this precedence:

1. If the current viewer is a full workspace member, resolve as that member.
2. Otherwise resolve through the current share token.
3. If neither path grants access, render `Restricted`.

This preserves the existing product behavior that authenticated full members are not artificially constrained by the share token.

### Sibling Pages With Separate Link Shares

If page `A` is open at `/s/tokenA` and it mentions sibling page `B`:

- render `B` normally only if the current viewer can access `B` through full membership, or through `tokenA` under the nearest-shared-ancestor rule
- render `Restricted` if `B` is only accessible through some other token such as `tokenB`

v1 must not try to discover or hop to another share token.

## Navigation

### Canonical Views

Accessible mentions should navigate to:

`/$workspaceSlug/$pageId`

### Shared Views

Accessible mentions should navigate according to how they were resolved:

- full workspace member: canonical route `/$workspaceSlug/$pageId`
- share-token access: shared route `/s/$token?page=$pageId`

- inaccessible mention: no navigation

Reason:

- if the current token grants access, staying inside `/s/:token` preserves the existing shared-page flow
- if access comes from full membership instead, canonical workspace navigation is the correct destination

## Data Resolution Strategy

### Insertion Suggestions

Use the current page list from the workspace store.

Do not call the workspace search endpoint for v1 page-mention insertion.

Reasons:

- smaller implementation
- suggestions need title/icon only, not FTS snippets
- the loaded page list already respects access in guest and non-member canonical views

### Rendering

Rendering should not depend only on the local page store.

Add a small page-mention resolver that can batch-resolve page IDs for the current viewer context and return:

```ts
type ResolvedPageMention = {
  pageId: string;
  accessible: boolean;
  title: string | null;
  icon: string | null;
  workspaceSlug: string | null;
  routeKind: "canonical" | "shared" | "restricted";
};
```

Batching matters because a document may contain many mentions.

The resolver should use existing permission semantics rather than inventing a second access system.

## Route And API Expectations

v1 should add a dedicated resolver rather than issuing one request per mention node.

Suggested shape:

- route owned by the worker page surface
- request includes `workspaceId`, `pageIds[]`, and optional `shareToken`
- response returns one resolved item per requested `pageId`

The resolver should:

- use the authenticated user when present
- use the share token when present
- prefer full workspace membership over share-token restriction
- return no title/icon for inaccessible pages

If request or response shapes are added for this route, update `src/shared/types.ts`.

## Tiptap Integration

v1 should use a dedicated page-mention node, not the generic link mark.

Reasons:

- the canonical data is `pageId`, not `href`
- destination URLs depend on viewer context
- the existing link mark and toolbars are URL-oriented
- page mentions behave more like structured inline entities than plain text marks

Implementation notes:

- use a Tiptap inline atom node for `pageMention`
- use `@tiptap/suggestion` with custom matching for the `[[` trigger, or an equivalent small custom suggestion plugin
- add a slash-menu insertion item so page mentions are discoverable without memorizing the typed trigger
- a custom node is preferred over storing internal-page data in `link.href`

## Shared-Editor Policy

Insertion in `/s/:token` editors is disabled in v1.

Reason:

- the page discovery surface in shared editors is ambiguous
- we do not need to solve cross-share insertion to ship page mentions
- rendering existing mentions in shared views is still required

This restriction applies only to insertion. Existing mentions must still render correctly in shared views.

## Rename And Staleness

Page mentions should display the current title from resolved metadata, not a stored label.

Accepted v1 behavior:

- mention labels may be stale until the surrounding page metadata refreshes or the mention resolver reruns
- no new real-time cross-document title broadcast is required for the first version

## Search Indexing

v1 does not need to index page-mention text into FTS.

Current FTS extraction walks `Y.XmlText` content only, so page mentions will not automatically contribute visible mention titles to search. That is acceptable for the first version.

If search parity becomes important later, add a follow-up that resolves mention `pageId`s during indexing and appends accessible titles to derived search text.

## Accessibility

Page mentions should:

- expose an accessible label when clickable
- expose `Restricted page mention` or equivalent when not clickable
- preserve keyboard navigation in read-only and editable contexts

## Minimal File Impact

The first implementation should stay close to the existing editor structure.

Expected touch points:

- `src/client/components/editor/extensions/create-editor-extensions.ts`
- new page-mention extension under `src/client/components/editor/extensions/`
- new page-mention suggestion/controller files under `src/client/components/editor/controllers/`
- `src/client/components/editor/editor-context.ts`
- shared mention resolver types in `src/shared/types.ts`
- worker route for batched mention resolution
- shared editor styles in `src/client/components/editor/styles/content.css` or `overlays.css`

## Acceptance Criteria

- editors can insert a page mention with `[[` in normal workspace editors
- editors can insert a page mention from the slash menu in normal workspace editors
- shared-link editors cannot insert new page mentions
- mentions render current title/icon when accessible
- mentions render `Restricted` with no title leak when inaccessible
- `/s/:token` mentions can still resolve normally for logged-in full workspace members
- sibling pages that are only available through a different token render as `Restricted`
- clicking an accessible mention navigates to the correct canonical or shared destination
- no target page title is persisted in the document node itself
- bare `@` remains unclaimed for future user-mention support
