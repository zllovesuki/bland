# Editor Export Options: Markdown and PDF

Date: 2026-04-14

## Context

This note captures OSS-only export options for bland's current editor stack.

Constraints:

- OSS only. Do not depend on Tiptap's paid Markdown export extension.
- PDF may use `@react-pdf/renderer` if needed, but it is not assumed to be
  the default path.
- The live source tree is the source of truth, not older editor docs.

Relevant source:

- [editor-body.tsx](../src/client/components/editor/editor-body.tsx)
- [editor-pane.tsx](../src/client/components/editor/editor-pane.tsx)
- [create-editor-extensions.ts](../src/client/components/editor/extensions/create-editor-extensions.ts)
- [page-mention-node.ts](../src/client/components/editor/extensions/page-mention-node.ts)
- [image-node.ts](../src/client/components/editor/extensions/image-node.ts)
- [image-node-view.tsx](../src/client/components/editor/extensions/image-node-view.tsx)
- [details-block.tsx](../src/client/components/editor/extensions/details-block.tsx)
- [table-extensions.ts](../src/client/components/editor/extensions/table-extensions.ts)
- [doc-sync.ts](../src/worker/durable-objects/doc-sync.ts)
- [uploads.ts](../src/worker/routes/uploads.ts)

## Current bland constraints

bland's editor is a Tiptap 3 + Yjs surface with collaborative state loaded from
`YJS_DOCUMENT_STORE` plus a separate `YJS_PAGE_TITLE` text value. The current
extension set includes standard rich-text nodes plus several custom or
customized behaviors:

- `details` / `detailsSummary` / `detailsContent`
- `pageMention`
- custom image attrs: `align`, `width`, `pendingInsertId`
- code blocks via `CodeBlockLowlight`
- task lists
- tables with persisted row height and column-width metadata
- emoji nodes
- text color, background color, and text alignment

That means export is feasible, but not every editor feature has a portable
Markdown representation.

Two architecture constraints matter immediately:

- bland does not currently have a general DocSync export RPC. The only content
  extraction RPC today is `getIndexPayload()`, which returns plaintext for
  search indexing, not structured document data.
- Page-scoped upload URLs are protected by refresh-cookie auth or `?share=...`.
  PDF generation cannot assume assets are public.

## Markdown options

### 1. `@tiptap/static-renderer/pm/markdown`

Status: best export-only fit

Why it fits:

- Official Tiptap OSS package.
- Converts ProseMirror JSON to Markdown without an editor instance.
- Supports custom node and mark mappings, which bland needs for custom nodes.
- Smaller surface area than building a serializer from raw ProseMirror APIs.

Why it is a good match for bland:

- bland already has a live editor schema in
  [create-editor-extensions.ts](../src/client/components/editor/extensions/create-editor-extensions.ts).
- Markdown export can stay client-side initially and serialize from the live
  editor state instead of adding a new Worker or DO export path.
- Custom node handling is explicit, which is better than hiding lossy behavior.

Tradeoffs:

- This is export-focused. If bland later wants Markdown import, this path alone
  is not enough.
- Some bland-specific attrs will still need downgrade rules.

### 2. `@tiptap/markdown`

Status: best if import may follow later

Why it fits:

- Official Tiptap Markdown package documented in current public docs.
- Supports custom parsing and custom serializing per extension.
- Gives a cleaner long-term path if bland wants both import and export.

Why not default it immediately:

- It is a larger integration than using the static renderer just for export.
- bland does not need Markdown as a primary persistence format.
- The repo currently stores collaborative state in Yjs, not Markdown.

Recommendation:

- Prefer this over community serializers if the roadmap expands to Markdown
  import or round-tripping.

### 3. `prosemirror-markdown`

Status: viable low-level fallback, not preferred

Why it fits:

- Mature OSS serializer/parser for CommonMark-ish ProseMirror schemas.
- Works well when the schema is close to the base ProseMirror Markdown schema.

Why it is weaker for bland:

- bland's schema is already beyond "basic Markdown schema".
- You would be writing more custom serializer logic by hand.
- It is a worse fit than the current official Tiptap OSS tools unless bland
  wants to stay close to raw ProseMirror APIs.

### 4. `@handlewithcare/remark-prosemirror`

Status: viable if mdast/unified becomes strategically useful

Why it fits:

- OSS bridge between ProseMirror and remark/mdast.
- Useful if bland wants a Markdown pipeline built around `remark`,
  transformations, linting, or downstream unified plugins.

Why it is not the default:

- More moving pieces than necessary for a first export feature.
- Adds mdast as another internal representation without clear current need.

## Markdown mapping decisions bland still needs

These are the main feature-level decisions regardless of which Markdown library
is chosen:

| Editor feature                      | Current behavior                                         | Markdown export guidance                                                                                    |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Page title                          | Stored separately from body Yjs fragment                 | Prepend as `# Title` outside the body serializer                                                            |
| `pageMention`                       | Node stores `pageId` only                                | Resolve title at export time and emit a normal link; if unresolved, fall back to `[[pageId]]` or plain text |
| Images                              | Standard image node plus `align` and `width` attrs       | Emit standard Markdown image by default; optionally emit raw HTML when preserving width/alignment matters   |
| `details`                           | Persistent disclosure block                              | Emit raw HTML `<details><summary>...</summary>...</details>`                                                |
| Tables                              | Tiptap table plus explicit width and row-height metadata | Emit normal Markdown/GFM table and drop presentational metadata                                             |
| Text color / background / alignment | Presentation attrs only                                  | Drop in plain Markdown mode; optionally emit raw HTML if preserving formatting matters                      |
| Emoji                               | Emoji extension nodes                                    | Export as Unicode emoji or shortcodes                                                                       |
| Code blocks                         | Language-aware fenced blocks                             | Export as fenced code blocks with language info                                                             |

## PDF options

### 1. Dedicated export view + browser print / Save as PDF

Status: recommended MVP

Why it fits:

- Reuses the existing DOM renderer and current editor styles.
- Reuses current image loading and auth behavior.
- Minimal architecture change compared to introducing a second renderer.
- Highest chance of matching the current document appearance quickly.

What this would look like:

- Add a dedicated read-only export route or print mode.
- Render the page title plus read-only document content.
- Add print CSS for margins, hidden app chrome, page breaks, and table/image
  overflow handling.
- Let the browser print dialog produce the PDF.

Tradeoffs:

- Browser print output is less deterministic than a dedicated PDF renderer.
- Cross-browser polish takes real CSS work.
- If bland later needs branded, exact, multi-page PDFs, this likely becomes a
  stepping stone rather than the final system.

### 2. `@react-pdf/renderer`

Status: viable for high-control PDFs, but not the first choice

Why it fits:

- OSS React-based PDF renderer.
- Supports browser and server-side generation in its documented model.
- Good fit if bland needs deterministic layout, branded export templates, or
  generated PDFs outside a browser print flow.

Why it is not the default for bland:

- It is a second rendering system, not a light wrapper around current DOM/CSS.
- bland would need a ProseMirror-to-PDF component mapper for every relevant
  node type.
- Protected upload URLs complicate asset loading unless export first rewrites
  images to blob URLs/data URLs or passes authenticated fetch logic.
- Upstream has had packaging and SSR friction. That matters more in a
  Cloudflare/edge-oriented app than in a plain Node app.

Recommendation:

- Treat `@react-pdf/renderer` as phase two if print CSS is not good enough or
  if the product needs consistent branded output that browsers cannot provide.

### 3. HTML print stack with paged media tooling

Status: plausible alternative, not investigated as the preferred path

This family of approaches keeps HTML/CSS as the source renderer and layers
pagination or print tooling on top. It may be attractive if bland wants more
control than plain print CSS but still wants to avoid a second document
renderer.

This was not investigated as deeply as the Markdown and `@react-pdf/renderer`
paths because browser print is the simpler first move for bland's current
architecture.

## Client-side vs server-side export

### Client-side first

Recommended default for both Markdown and the first PDF implementation.

Why:

- The live editor already has the full document state in memory.
- No new DocSync RPC is required.
- Avoids reconstructing structured content from persisted Yjs snapshots in the
  Worker.

### Server-side later

Only needed if bland wants background jobs, share-link export without loading
the editor, or admin/bulk export.

What would be required:

- Add a new DocSync RPC that returns structured document content, not only
  plaintext.
- Reconstruct ProseMirror JSON from Yjs state, likely via `y-prosemirror`.
- Centralize mention resolution and asset auth for export jobs.

This is a real structural step, not a small patch. It should be done only when
there is a concrete product need for server-side export.

## Recommendation

### Recommended sequence

1. Ship Markdown export first with `@tiptap/static-renderer/pm/markdown`.
2. Keep the first version client-side from the live editor state.
3. Define explicit downgrade rules for bland-only features instead of pretending
   Markdown can preserve everything.
4. For PDF, start with a dedicated read-only export view plus print CSS and the
   browser's PDF output.
5. Only spike `@react-pdf/renderer` if print output is not acceptable.
6. Add a DocSync structured export RPC only if server-side export becomes a
   real feature requirement.

### Preferred choices today

- Markdown: `@tiptap/static-renderer/pm/markdown`
- PDF MVP: dedicated export view + browser print
- PDF later, if needed: `@react-pdf/renderer`
- Server-side structured export later, if needed: DocSync export RPC +
  `y-prosemirror`

## Why this sequence fits bland

- It does more with less code.
- It avoids paying the cost of a second renderer before the product proves it
  is necessary.
- It does not block a stronger future design. If bland later needs
  import/export parity, branded PDFs, or background export jobs, the next layer
  is clear.
- It respects bland's current architecture: Yjs in DocSync, metadata in D1,
  protected upload URLs, and a custom Tiptap schema rather than a plain
  Markdown document model.

## Sources

- Tiptap static renderer:
  https://tiptap.dev/docs/editor/api/utilities/static-renderer
- Tiptap Markdown docs:
  https://tiptap.dev/docs/editor/markdown
- Tiptap custom Markdown integration guide:
  https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension
- Tiptap Markdown release note:
  https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap
- Tiptap output guide:
  https://tiptap.dev/docs/guides/output-json-html
- `prosemirror-markdown`:
  https://github.com/ProseMirror/prosemirror-markdown
- `@handlewithcare/remark-prosemirror`:
  https://github.com/handlewithcarecollective/remark-prosemirror
- `@react-pdf/renderer`:
  https://react-pdf.org/
- `@react-pdf/renderer` packaging / SSR issue:
  https://github.com/diegomura/react-pdf/issues/2624
- `y-prosemirror`:
  https://github.com/yjs/y-prosemirror
