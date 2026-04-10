# AI Features Research

Research into AI-related product features for bland v2+. Conducted April 2026 collaboratively between Claude and Codex agents, exploring the bland codebase, Tiptap OSS source, Cloudflare Workers AI platform, and competitive landscape.

AI features are explicitly out of scope for v1 (see `bland-production-spec.md`). This document proposes what to build and where it integrates.

## Guiding principles

- Embed AI into existing writing and search surfaces. No mode-switches, no parallel workflows.
- Keep AI suggestions transient (ProseMirror decorations, not durable marks). bland does not yet have a comments or review model, and Yjs relative-position mapping has known limitations around collaborative paragraph splits.
- Ship for authenticated workspace members first. Defer shared-link AI until the access model is intentionally designed.
- Complement FTS5 with semantic search; do not replace it. The current fast title/snippet search UX must not regress.
- Use server-authoritative text for summarization and page Q&A (`DocSync.getIndexPayload`). Use client-sent context for cursor-neighborhood features where the server cannot know the ephemeral state.
- All Tiptap extensions must be OSS. Every Tiptap AI extension (`@tiptap-pro/ai-toolkit`, `@tiptap-pro/server-ai-toolkit`, `@tiptap-pro/extension-ai`) is paid/Pro. bland builds its own AI integration using OSS Tiptap core and ProseMirror plugin API.

## Ranked feature matrix

| Rank | Feature                              | Complexity | Impact   | UI surface                                                     | Priority       |
| ---- | ------------------------------------ | ---------- | -------- | -------------------------------------------------------------- | -------------- |
| 1    | Selection rewrite / proofread / tone | Low        | High     | AI button in existing `FormattingToolbar` BubbleMenu           | v2 first wave  |
| 2    | Generate / continue at cursor        | Low-Med    | High     | New slash menu items in "AI" group + drag-handle plus button   | v2 first wave  |
| 3    | Summarize page + ask current page    | Low-Med    | Med-High | Top bar button, `/summarize` slash command, side sheet for Q&A | v2 first wave  |
| 4    | Semantic search + ask workspace      | Med-High   | High     | Cmd+K search dialog second tab or blended results              | v2 second wave |
| 5    | Reusable AI prompts / presets        | Medium     | Medium   | AI action submenu + workspace settings                         | v2 second wave |
| 6    | Persistent writing instructions      | Medium     | Medium   | Workspace settings page                                        | v2 follow-on   |
| 7    | Edge inference (Gemma 4 E2B)         | Very High  | Medium   | Client-only local selection actions                            | Research only  |

## What not to build

Both research agents independently agreed these are poor fits for bland right now:

- **Durable AI review comments / tracked changes** -- no underlying review model exists yet.
- **Autonomous agent editing of live documents** -- high risk, low value at ~1K users.
- **Cross-app enterprise connectors** -- different product direction.
- **Attachment OCR/PDF RAG** -- out of scope for first AI wave.
- **AI Gateway as first-wave dependency** -- does not support streaming responses yet. Defer to ops/observability layer.
- **Database/row/column AI** -- bland has no databases in v1.

## Cloudflare platform integration

### New bindings required (wrangler.jsonc)

```jsonc
"ai": { "binding": "AI" },
"vectorize": [{ "binding": "VECTORIZE", "index_name": "bland-pages" }],
"ratelimits": [
  { "name": "RL_AI", "namespace_id": "101003", "simple": { "limit": 30, "period": 60 } }
]
```

### Workers AI models

| Task                            | Recommended model                         | Notes                                     |
| ------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Text rewrite / tone / proofread | `@cf/meta/llama-4-scout-17b-16e-instruct` | 131K context, function calling, streaming |
| Fast generation                 | `@cf/qwen/qwen3-30b-a3b-fp8`              | 32K context, fast MoE inference           |
| Embeddings                      | `@cf/baai/bge-base-en-v1.5`               | 768-dim, 512 tokens                       |
| Multilingual embeddings         | `@cf/baai/bge-m3`                         | 1024-dim, 100+ languages                  |
| Summarization                   | `@cf/facebook/bart-large-cnn`             | Free ($0/M tokens), dedicated summarizer  |

### Practical constraints

- **Rate limits**: Text generation 300 rpm, embeddings 3000 rpm, summarization 1500 rpm. Fine for ~1K users with opt-in features; add `RL_AI` at 30/min per user.
- **Streaming**: `env.AI.run(model, { stream: true })` returns a `ReadableStream`. Return it directly as `new Response(stream, { headers: { "content-type": "text/event-stream" } })`. Do not use Hono's `stream()` / `streamSSE()` wrappers -- they cause full-response buffering.
- **max_tokens**: Defaults to 256. Always set explicitly.
- **CPU time**: Does not count while waiting on AI inference I/O. Inline streaming is operationally reasonable.
- **Memory**: Workers still 128 MB. Stream directly to client; do not buffer full model output.
- **Concurrent connections**: 6 simultaneous outgoing connections per Worker invocation. Parallelize AI calls carefully.
- **Session affinity**: Use `x-session-affinity` header for prompt caching on repeated page interactions. Place static system prompt prefix first.
- **Queue consumers**: 15-min wall time cap. Incremental on-save embedding indexing is much better than batch re-index jobs.
- **Local dev**: Wrangler hits real Cloudflare API for AI calls. Expect charges during development.

### Cost direction

- Vectorize is cheap at bland's scale (pennies/month for ~10K pages).
- Workers AI inference is usage-sensitive but stays modest for opt-in write-assist features.
- Summarization with `bart-large-cnn` is free.
- Total AI infra cost should be modest relative to bland's current ~$40/month baseline, assuming moderate opt-in adoption. Exact figures depend on prompt size, streaming length, and user adoption rate.

## Feature details

### Rank 1: Selection rewrite / proofread / tone change

Select text, click AI button in bubble menu, choose action (Proofread, Make formal, Make casual, Simplify, Expand), see suggestion overlay, accept or reject.

**Client integration**:

- Add sparkle icon button to existing `FormattingToolbar` in `src/client/components/editor/controllers/formatting-toolbar.tsx`.
- On click, open submenu panel with action choices.
- Send selected text + ~200 chars before/after context + page title to Worker. Do not send the whole page.
- Response arrives as SSE stream.
- `Decoration.inline()` shows suggested replacement with highlight + accept/reject controls.
- Accept: `editor.chain().deleteRange(range).insertContentAt(pos, newText).run()`.
- Reject: clear decorations.

**Worker integration**:

- New `src/worker/routes/ai.ts` with `POST /ai/rewrite` route.
- Accepts `{ action, selectedText, beforeContext, afterContext, pageTitle }`.
- Calls `env.AI.run(model, { messages, stream: true })`.
- Returns SSE stream directly.

**Key decision**: Keep AI suggestions transient. ProseMirror `Decoration.inline()` for ephemeral overlays, not durable marks. Apply or reject immediately. Yjs relative-position limitations around paragraph splits reinforce this.

### Rank 2: Generate / continue at cursor

Type `/ai` or `/continue` in slash menu. AI generates text at cursor based on surrounding context, streaming into the document.

**Client integration**:

- Add items to `getSlashMenuItems()` in `src/client/components/editor/controllers/slash-items.ts`:
  - "Continue writing" (aliases: `ai`, `continue`)
  - "Explain"
  - "Brainstorm"
- Command handler extracts ~500 chars before cursor as context, starts SSE fetch.
- Use `editor.chain().insertContentAt(cursorPos, chunk).run()` for each SSE chunk with `updateSelection: false`.
- Show subtle typing indicator during generation.

**Worker integration**:

- `POST /ai/generate` route.
- Accepts `{ prompt, contextBefore, contextAfter, pageTitle }`.
- System prompt instructs model to continue writing in the document's existing style.

### Rank 3: Summarize page + ask current page

Click "Summarize" in page top bar or type `/summarize`. See concise summary. Optionally ask follow-up questions about the page.

**Client integration**:

- New button in page view top bar or slash command item.
- Opens result in lightweight panel or side sheet.
- For "ask page" follow-ups, a simple chat-style input below the summary.

**Worker integration**:

- `POST /pages/:pid/summarize` route.
- Fetches text server-side via `DocSync.getIndexPayload(pageId)` -- avoids trusting client-sent content.
- Uses `@cf/facebook/bart-large-cnn` (free) for basic summaries.
- For "ask page" follow-up questions, uses text generation model with page content as context.

**Scope boundary**: "Ask page" (page-scoped, uses `getIndexPayload`) belongs in the first wave. "Ask workspace" (cross-page retrieval) belongs with semantic search in the second wave.

### Rank 4: Semantic search + ask workspace

Upgrade Cmd+K search from keyword-only to meaning-based. FTS5 handles exact keyword matches; Vectorize handles conceptual similarity.

**Infrastructure**:

- Single Vectorize index `bland-pages` with `namespace = workspaceId`. Current limits support 10M vectors and 50K namespaces per index.
- Queue consumer (`src/worker/queues/search-indexer.ts`) adds embedding step after text extraction from `DocSync.getIndexPayload()`.
- Document text chunked at ~400 tokens per chunk, embedded via `bge-base-en-v1.5`.
- Vectors upserted with metadata: `{ pageId, chunkIndex }`.

**Search flow**:

- Query embedded using the same model.
- Vectorize returns top-K similar chunks with page IDs.
- Merged with FTS5 keyword results, deduplicated, ranked.
- Client search dialog gets a mode toggle or unified blended ranking.

**Access control**: Member-only, matching current FTS5 access control. Share-link semantic search is a separate ACL design problem.

**"Ask workspace" variant**: After retrieval, pass query + retrieved chunks to a text generation model for a grounded answer with source citations. Second-wave feature due to chunking, retrieval, ranking, and answer UX complexity.

### Rank 5-6: Reusable prompts and writing instructions

Save custom AI prompts (e.g., "Rewrite for our brand voice") that appear in the AI action menu. Workspace-level writing instructions injected into all AI system prompts automatically.

Low infrastructure lift -- mostly UI and D1 storage. Strong competitive parity with Craft custom prompts and Notion agent instructions.

### Rank 7: Edge inference (Gemma 4 E2B) -- research only

Google Gemma 4 E2B (~2B effective parameters) runs in-browser via WebGPU and transformers.js. ONNX checkpoints exist (`onnx-community/gemma-4-E2B-it-ONNX`, q4f16 quantized).

**Current blockers**:

- ~2.7 GB model download.
- Requires WebGPU + `shader-f16` browser support (not universal).
- Context limited to 4096 tokens.
- Packaging is explicitly experimental.

**Recommendation**: Frame as "possible fallback for local-only selection rewrite on capable devices," not core architecture. Revisit when WebGPU adoption and model compression improve.

## OSS Tiptap building blocks

All AI features can be built using these OSS primitives already available in Tiptap 3:

| Primitive             | Package / file                                  | Use                                                                       |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `@tiptap/suggestion`  | `packages/suggestion/src/suggestion.ts`         | Inline AI triggers, ghost-text anchors, menu positioning via `clientRect` |
| `Decoration.inline()` | ProseMirror core                                | Suggestion overlays, proofread highlights, accept/reject UI               |
| `Decoration.widget()` | ProseMirror core                                | Typing indicators, AI caret markers                                       |
| `Decoration.node()`   | `packages/extension-node-range/`                | Block-level AI suggestion markers                                         |
| `insertContentAt`     | `packages/core/src/commands/insertContentAt.ts` | Streaming text insertion at cursor or selection replacement               |
| `BubbleMenu`          | `packages/react/src/BubbleMenu.tsx`             | Selection-based AI action menu (already used by `FormattingToolbar`)      |
| `posToDOMRect`        | `packages/core/src/helpers/posToDOMRect.ts`     | Anchor rect for dedicated AI floating menus                               |
| `getTextBetween`      | `packages/core/src/helpers/getTextBetween.ts`   | Context extraction around cursor or selection                             |
| `@floating-ui/dom`    | Already a bland dependency                      | Floating AI UI positioning                                                |
| Plugin API            | `packages/core/src/Extendable.ts`               | Custom `AISuggestionPlugin` with decoration state management              |

### Custom extension pattern

```typescript
// src/client/components/editor/extensions/ai-suggestion.ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const aiSuggestionKey = new PluginKey("aiSuggestion");

export const AISuggestion = Extension.create({
  name: "aiSuggestion",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: aiSuggestionKey,
        state: {
          init: () => ({ suggestions: [], decorations: DecorationSet.empty }),
          apply: (tr, prev, oldState, newState) => {
            const meta = tr.getMeta(aiSuggestionKey);
            if (meta?.type === "add") {
              // Create inline decoration for the suggestion
            }
            if (meta?.type === "clear") {
              return { suggestions: [], decorations: DecorationSet.empty };
            }
            return { ...prev, decorations: prev.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => aiSuggestionKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
```

## Architecture diagrams

### Inline AI features (rewrite, generate, proofread)

```
Client (editor)
  FormattingToolbar "AI" button  -or-  Slash menu "/ai"
    |
    v
  Extract: selected text + before/after context (~200-500 chars) + page title
    |
    v
  POST /api/v1/ai/{action}  (streaming SSE)

Worker
  requireAuth -> rateLimit("RL_AI") -> membership check
    |
    v
  env.AI.run(model, { messages: [...], stream: true })
    |
    v
  return new Response(stream, { "content-type": "text/event-stream" })

Client
  Read SSE chunks via ReadableStream reader
    |
    +-- Generation: editor.chain().insertContentAt(pos, chunk).run()
    +-- Rewrite: Decoration.inline() overlays -> accept/reject controls
```

### Semantic search (extends existing pipeline)

```
DocSync.onSave()
  |
  v
Queue (index-page message)
  |
  v
Queue Consumer (src/worker/queues/search-indexer.ts):
  1. DocSync.getIndexPayload(pageId) -> { title, bodyText }
  2. WorkspaceIndexer.indexPage(pageId, title, bodyText)       [existing FTS5]
  3. env.AI.run("@cf/baai/bge-base-en-v1.5", { text: chunks }) [new: embeddings]
  4. env.VECTORIZE.upsert(vectors, { namespace: workspaceId })  [new: vector store]

Search query:
  GET /api/v1/workspaces/:wid/search?q=...&mode=hybrid
    1. Embed query via Workers AI
    2. Vectorize.query({ topK: 20, filter: {}, namespace: workspaceId })
    3. FTS5 keyword search via WorkspaceIndexer.search()
    4. Merge, deduplicate, rank
    5. Return blended results
```

### Page summarization

```
POST /api/v1/pages/:pid/summarize
  requireAuth -> requireMembership
    |
    v
  DocSync.getIndexPayload(pageId)  [server-authoritative text]
    |
    v
  env.AI.run("@cf/facebook/bart-large-cnn", { input_text: bodyText })
    |
    v
  return { summary }
```

## Competitive context

Features that show up repeatedly in real document products and get genuine engagement:

- **Selection rewrite / proofread / tone** -- Notion, Craft, Google Docs all expose this prominently. Low friction, high daily touchpoints.
- **Page summarization** -- Coda, Google Docs, Notion. Reduces friction for long documents and meeting notes.
- **Workspace Q&A / semantic search** -- Notion enterprise search, Craft assistant. Highest differentiation but also highest lift.
- **Reusable prompts / writing instructions** -- Craft custom prompts, Notion agent skills. Becoming standard.

Features that look less aligned for bland:

- **AI reviewer/comments/tracked changes** -- requires review model bland does not have.
- **Database/column AI** -- Coda/Notion pattern; bland has no databases.
- **Autonomous document agents** -- impressive demos, low value at 1K-user scale.

**Key insight**: Sticky AI features are the ones embedded directly into existing writing and search surfaces with almost no mode-switch cost. The gimmick zone starts when AI becomes its own parallel workflow.
