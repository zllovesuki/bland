# Emoji Bundle

Research snapshot: April 15, 2026

This document is a handoff for implementing emoji-related bundle-size reductions and lazy code-block highlighting in `bland`.

## Goal

Reduce client bundle size without giving up cross-platform consistent emoji rendering.

The preferred direction is:

- Stop using `emoji-picker-react`.
- Reuse the same upstream emoji data model that `@tiptap/extension-emoji` already uses.
- Keep heavy emoji data behind lazy boundaries.
- Make code-block highlighting lazy instead of loading `lowlight` and all languages eagerly.

## Verified Findings

### Current build snapshot

`npm run build` succeeds. Relevant output from the current client build:

- `dist/client/assets/doc-messages-CB6ZAB64.js` — `1,242.88 kB` / `294.40 kB gzip`
- `dist/client/assets/esm-6YTgLAZ0.js` — `447.08 kB` / `146.82 kB gzip`
- `dist/client/assets/emoji-picker-react.esm-DFqVrWkf.js` — `307.36 kB` / `74.56 kB gzip`

The large `emoji-picker-react` chunk is already lazy for the picker UI, but the library also leaks onto the hot path through the icon component.

### Hot-path emoji leak

[src/client/components/ui/emoji-icon.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-icon.tsx:1) imports `Emoji` from `emoji-picker-react` directly:

```ts
import { Emoji, EmojiStyle } from "emoji-picker-react";
```

That means normal page/workspace icon rendering can preload the same heavy library that was supposed to stay picker-only.

### Picker is already lazy

[src/client/components/ui/emoji-picker.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker.tsx:1) already lazy-loads [emoji-picker-impl.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker-impl.tsx:1).

That lazy boundary should be preserved. The replacement picker should keep the same public `EmojiPicker` component API if possible.

### What `@tiptap/extension-emoji` actually ships

The installed version is `3.22.3`.

Verified from `node_modules/@tiptap/extension-emoji/package.json`:

- runtime dependencies: `emoji-regex`, `emojibase-data`, `is-emoji-supported`
- peer deps: `@tiptap/core`, `@tiptap/pm`, `@tiptap/suggestion`

Important detail: the published package does not read `emojibase-data` dynamically at runtime. Its built file already contains a generated emoji dataset.

Verified locally:

- `node_modules/@tiptap/extension-emoji/src/data.ts` size: `625878` bytes
- `node_modules/@tiptap/extension-emoji/dist/index.js` size: `647403` bytes

The package exports:

- `emojis`
- `gitHubEmojis`
- `gitHubCustomEmojis`
- `emojiToShortcode`
- `shortcodeToEmoji`

The exported `emojis` list contains:

- `1949` total entries
- `1908` entries with `fallbackImage`

The fallback images point to Apple-style assets on jsDelivr, generated from `emoji-datasource-apple`.

### Tiptap generator details

The generation logic lives at `node_modules/@tiptap/extension-emoji/src/generate.ts`.

It combines:

- `emojibase-data`
- `emoji-datasource`
- GitHub shortcode data

It produces entries like:

- `emoji`
- `name`
- `shortcodes`
- `tags`
- `group`
- `version`
- `fallbackImage`

This is the right upstream shape to reuse if we want one emoji stack across editor and app UI.

### Skin tone caveat

Tiptap’s exported emoji list includes standalone tone modifiers such as `🏻`, `🏼`, `🏽`, `🏾`, `🏿`.

In a quick verification pass, I did not find combined entries such as `👍🏻` in the exported data.

That means a custom picker built from Tiptap exports may not match `emoji-picker-react` behavior for skin-tone selection unless that behavior is implemented separately.

Treat this as an explicit test item, not an assumption.

### Picker/library maintenance snapshot

Verified from npm metadata on April 15, 2026:

- `emoji-picker-react@4.18.0` latest published: February 7, 2026
- `emoji-picker-element@1.29.1` latest published: March 1, 2026
- `emoji-mart@5.6.0` latest published: April 25, 2024
- `@emoji-mart/react@1.1.1` latest published: January 2, 2023
- `react-twemoji@0.7.2` latest published: January 22, 2026
- `@ferrucc-io/emoji-picker@0.0.48` latest published: November 16, 2025

### Replacement options already evaluated

#### `emoji-picker-react`

- actively maintained
- too heavy for this repo’s needs
- npm unpacked size is about `34.3 MB`
- current app already proves it adds a large lazy chunk and leaks into the hot path through `EmojiIcon`

#### `emoji-picker-element`

- actively maintained
- very small runtime package
- native-first rendering model
- can use custom fonts, but its docs explicitly warn that color-font support varies across browsers and OSes
- not the best fit if we want Apple-style consistency rather than native rendering

#### `react-twemoji` / `@twemoji/api`

- viable only if we accept a Twemoji look
- useful for render-only augmentation
- not a good match if the product wants to preserve Apple-style fallback consistency

#### `@ferrucc-io/emoji-picker`

- newer and active
- still bundles its own emoji data and assumes Tailwind
- not obviously better than building a smaller app-owned picker from Tiptap-compatible data

## Recommendation

Use the same upstream emoji stack as `@tiptap/extension-emoji`, but do not import the full `@tiptap/extension-emoji` module on the hot path.

Concretely:

1. Replace `emoji-picker-react` with an app-owned lazy picker.
2. Build that picker from Tiptap-compatible emoji data and helpers.
3. Replace `EmojiIcon` with a tiny renderer that does not import `emoji-picker-react`.
4. Keep the heavy emoji dataset out of normal page/workspace routes.
5. Lazy-load code-block highlighting.

## Recommended Implementation Shape

### 1. Replace `EmojiIcon` first

Target file:

- [src/client/components/ui/emoji-icon.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-icon.tsx:1)

Do not import:

- `emoji-picker-react`
- `@tiptap/extension-emoji`

Recommended replacement:

- a tiny app-owned component that renders a single emoji using a compact generated map from emoji string to Apple fallback image URL
- preserve current visual size API
- keep output compatible with page/workspace icons in app chrome and share views

Why:

- this removes the hot-path leak immediately
- it avoids paying for the full picker library or the full Tiptap emoji module on every page route

### 2. Generate a compact icon dataset

Recommended new artifact:

- `src/client/lib/emoji-icon-data.ts` or `src/client/lib/generated/emoji-icon-data.ts`

Recommended generator:

- a small script under `scripts/` that derives a minimal map from the same sources Tiptap uses

The compact icon dataset only needs fields required for icon rendering:

- `emoji`
- `fallbackImage`

Optional additional fields if useful:

- `shortcodes`
- `name`

Do not ship raw `emojibase-data` or the full Tiptap emoji export to the hot path.

### 3. Build a custom lazy picker

Likely files:

- [src/client/components/ui/emoji-picker.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker.tsx:1)
- [src/client/components/ui/emoji-picker-impl.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker-impl.tsx:1)
- one or more new small helper modules for search/grouping

Keep:

- `EmojiPicker` component name
- current `onSelect(emoji: string)` contract
- existing lazy boundary in `emoji-picker.tsx`

Recommended picker implementation:

- simple search box
- grouped sections
- scrollable grid/list
- Apple-style fallback rendering using the same data source as the icon path
- no new emoji ecosystem unless absolutely necessary

This picker does not need to match `emoji-picker-react` feature-for-feature.

It only needs to preserve current product behavior that is actually used in `bland`:

- picking an emoji string
- searching emoji
- consistent rendering

### 4. Reuse Tiptap exports only behind lazy boundaries

It is acceptable to use:

- `emojis`
- `emojiToShortcode`
- `shortcodeToEmoji`

from `@tiptap/extension-emoji` inside lazy editor-only or picker-only code.

It is not acceptable to import `@tiptap/extension-emoji` from app-wide icon rendering or route-level hot paths.

Reason:

- the module is about `647 kB` raw
- it is already the likely source of a major editor chunk
- reusing its exports in the wrong place defeats the bundle-size goal

### 5. Lazy-load code-block highlighting

Current eager imports are in:

- [src/client/components/editor/extensions/code-block/extension.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/code-block/extension.ts:1)

That file currently imports:

- `lowlight`
- `highlight.js`
- 18 language definitions

Recommended direction:

- move `lowlight` creation and language registration behind a dynamic import
- keep the default editor path functional without loading highlight support until a code block is actually needed

Possible implementation shapes:

- lazy load the entire highlighted code-block extension
- or lazy load the language/highlight runtime on first code-block interaction

Prefer the smallest correct implementation over a more abstract solution.

## Files Most Likely To Change

- [src/client/components/ui/emoji-icon.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-icon.tsx:1)
- [src/client/components/ui/emoji-picker.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker.tsx:1)
- [src/client/components/ui/emoji-picker-impl.tsx](/home/vendetta/code/bland/src/client/components/ui/emoji-picker-impl.tsx:1)
- [src/client/components/editor/extensions/code-block/extension.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/code-block/extension.ts:1)
- [src/client/components/editor/extensions/create-editor-extensions.ts](/home/vendetta/code/bland/src/client/components/editor/extensions/create-editor-extensions.ts:1)
- a new generated emoji data module under `src/client/lib/` or `src/client/lib/generated/`
- optionally a generator script under `scripts/`
- `package.json` if `emoji-picker-react` is removed

## Constraints

- Keep edits scoped.
- Do not broaden the editor architecture.
- Preserve cross-platform consistent emoji rendering.
- Prefer using the same upstream emoji sources as Tiptap rather than introducing a second full emoji system.
- Do not import large emoji datasets on hot paths.
- Preserve existing `EmojiPicker` call sites unless a simpler refactor is clearly smaller and safer.

## Open Questions To Resolve During Implementation

1. Does current product behavior rely on skin-tone selection in any real flow?
2. Is jsDelivr-hosted Apple emoji imagery acceptable, or should the project vendor/copy the assets it actually uses?
3. Is it enough to lazy-load highlight runtime on first code-block usage, or should the whole code-block highlighting extension be split?
4. Can share-view/read-only routes avoid importing full editable editor dependencies?

## Validation Checklist

Run:

- `npm run typecheck`
- `npm run build`

Compare before/after client bundle output.

Manual checks:

- page/workspace icons render consistently in sidebar, breadcrumbs, page header, shared views
- icon picker still works
- workspace settings emoji picker still works
- editor emoji insert still works
- share view still renders icons correctly
- code blocks still render and highlight after lazy load
- no regressions in read-only share routes

If any emoji rendering path falls back to native text unexpectedly, call it out explicitly.
