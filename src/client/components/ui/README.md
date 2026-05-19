# UI primitives

This directory owns the app's interactive primitives. Three invariants govern what lives here and how new UI gets built.

## I1 — Stacking

Every floating menu, popover, and suggestion surface portals to `document.body` through `<DropdownPortal>`. Inline `absolute z-N` for floating UI is a bug — the surrounding element's `transform`, `filter`, or `backdrop-filter` will eventually trap it.

The only legitimate bracketed z-layers are:

| Layer                           | Value     | File                                                                        |
| ------------------------------- | --------- | --------------------------------------------------------------------------- |
| Mobile drawer                   | `z-[80]`  | `ui/mobile-drawer.tsx`                                                      |
| Dialog backdrop / search dialog | `z-[90]`  | `ui/dialog.tsx`, `sidebar/search-dialog.tsx`                                |
| Toast                           | `z-[100]` | `toast.tsx`                                                                 |
| Skip-link on focus              | `z-[200]` | `workspace/layout.tsx`, `share/layout.tsx`, `layouts/standalone-layout.tsx` |

Sub-stacking inside dialog/drawer/canvas surfaces uses small `z-10`/`z-30`/`z-40` and is OK — those are page-region surfaces, not menus.

If you find yourself writing `className="… absolute z-N"` for a menu, stop — use `<DropdownPortal>`.

## I2 — Action surface

Every interactive _action_ renders through `<Button>` (app) or `<ToolbarButton>` (editor). Hover, focus, and disabled vocabularies are owned by the primitives.

Raw `<button>` is reserved for _non-action_ elements:

- **Data badges that toggle a menu** — `workspace/settings.tsx:323` member role chip, `workspace/settings.tsx:152` workspace icon chip. The badge IS the data display; its dropdown affordance is incidental.
- **Visual selectors** — cover-picker gradient swatches, color-picker color swatches. They're previews, not action labels.
- **Drop zones** — `cover-picker.tsx:137` "Choose image" dashed-border drop target.
- **List-row wrappers** — share-tab user/link rows where the whole row is clickable.
- **Drag handles** — `editor/controllers/drag-handle.tsx` (drag + onClick semantics, not toolbar).
- **Menu items** — items inside `<DropdownPortal>` content, `tiptap-menu-item`, `tiptap-block-menu-item`, `tiptap-table-menu-item`. They use `onClick` activation with `onMouseDown.preventDefault()` for drag-cancel forgiveness, which is different from `<ToolbarButton>`'s `onMouseDown`-activate.

## I3 — Motion

Three tokens own the motion vocabulary. No hand-coded keyframe strings in component CSS.

| Token                       | Duration           | Where                                                                                    |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `var(--animate-menu)`       | 150ms `fade-in`    | every compact menu/popover (`<DropdownPortal>` inner, editor toolbar bubbles, dropdowns) |
| `var(--animate-scale-fade)` | 300ms `scale-fade` | shell-level reveals (search dialog, command palette)                                     |
| `var(--animate-slide-up)`   | 350ms `slide-up`   | modal dialogs, toasts, mobile drawer                                                     |
| `var(--animate-fade-in)`    | 400ms `fade-in`    | page-level reveals only (`landing-page.tsx`, `document-layout.tsx`) — **not** for menus  |

Default transition duration for hover/state changes is `--default-transition-duration: 75ms` (from `theme.css`). For Tailwind utility classes use `transition` (covers opacity, colors, transform, shadow) or scoped equivalents — never the bracket-list syntax `transition-[a,b,c]`.

`--animate-menu` is opacity-only by design. Menus position via `transform: translate(...)` (Floating UI) or top/left, and a transform-based animation would conflict with positioning. If you ever bring back a scale flourish, do it on an inner div (the way `<DropdownPortal>` nests already), not on the floating element itself.

### Intentional motion exceptions

- **`summarize-sheet`** uses a bespoke 200ms cubic-bezier translateX+opacity. It's the only horizontal side-sheet in the codebase — tokenizing for one occurrence would be speculative.
- **`search-dialog`** bypasses `<Dialog>` and uses `animate-scale-fade` directly. It's a command-palette pattern (transient overlay), not a modal — keep the bypass.

## Primitives

| Primitive          | File                                    | Use for                                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Button>`         | `ui/button.tsx`                         | Every app action button. Variants: `primary`/`secondary`/`danger`/`ghost`/`subtle` (subtle = metadata affordance with faded label, e.g. "Add icon"/"Add cover" above the page title). Sizes: `xs`/`sm`/`md`. Set `iconOnly` for icon-only buttons (pass `aria-label`).             |
| `<ToolbarButton>`  | `editor/controllers/toolbar-button.tsx` | Buttons inside Tiptap floating toolbars (formatting, link). Forwards `ref` for popover anchoring. Uses `onMouseDown` + `preventDefault` to preserve editor selection. Visual styles live in `editor/styles/*.css` via CSS class targeting like `.tiptap-toolbar button.is-active`. |
| `<DropdownPortal>` | `ui/dropdown-portal.tsx`                | Every floating menu/popover/suggestion list. Portals to body, handles outside-click and Escape. Set `widthMode="match-trigger"` to size to the trigger element.                                                                                                                    |
| `<Dialog>`         | `ui/dialog.tsx`                         | Modal dialogs. Portaled, focus-trapped, Escape-dismissable.                                                                                                                                                                                                                        |
| `<MobileDrawer>`   | `ui/mobile-drawer.tsx`                  | Mobile-only side drawer. Slides up on enter (uses `--animate-slide-up`).                                                                                                                                                                                                           |

## Adding to the system

- New action button? Use `<Button>` with the closest variant. Don't override hover colors via `className` — that's drift the primitive should own. If the right variant doesn't exist yet, add it to the primitive.
- New menu? Use `<DropdownPortal>`. Anchor to the trigger via `triggerRef`. Don't write `absolute z-N` inline.
- New animation? Pick from the three motion tokens. Don't hand-code keyframes in component CSS.
- New shared (SSR-safe) variant of a primitive? Mirror the `Skeleton` pattern — implementation lives in `src/shared/components/ui/`, the client re-exports it from `src/client/components/ui/`. Only do this when an SSR consumer actually exists.

## Deferred

- **Tooltip primitive.** Native `title=` is used on data badges today (accessibility-correct, visually weak). Building a tooltip is its own brief (hover-intent timing, mobile press-and-hold, keyboard focus showing).
- **`<MenuItem>` primitive.** Menu items inside `<DropdownPortal>` content are currently raw `<button>` with custom CSS classes. A primitive could capture the `onClick` + `onMouseDown.preventDefault()` + role pattern. ~5 consumer call sites; worth extracting if a sixth appears.
- **ESLint enforcement.** A `no-restricted-syntax` rule flagging `className=` strings matching `/\babsolute\b.*\bz-\d/` in `src/client/components/` would mechanically enforce I1. Add when the next inline-menu drift incident proves the README isn't enough.
