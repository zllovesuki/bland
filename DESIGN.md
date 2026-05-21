---
name: bland
description: A quiet dark notes editor for developers
colors:
  accent-50: "#faf7ff"
  accent-100: "#f1ecfe"
  accent-200: "#e2d7fe"
  accent-300: "#ccb4fb"
  accent-400: "#b48ef5"
  accent-500: "#9d6ee8"
  accent-600: "#8854d4"
  accent-700: "#7241b8"
  accent-800: "#5e3497"
  accent-900: "#4d2a7c"
  zinc-50: "#fafaf9"
  zinc-100: "#f5f4f4"
  zinc-200: "#e5e4e5"
  zinc-300: "#d6d4d7"
  zinc-400: "#a3a1a8"
  zinc-500: "#747178"
  zinc-600: "#555259"
  zinc-700: "#423f42"
  zinc-800: "#2a2729"
  zinc-900: "#1b181a"
  zinc-950: "#0c090b"
  canvas: "#221f21"
  overlay-surface: "#423f42"
  callout-info: "#b6c8e6"
  callout-tip: "#d8c8eb"
  callout-warning: "#e2c598"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 450
    lineHeight: 1.7
    fontFeature: '"ss01" on, "cv01" on'
  label:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "JetBrains Mono, SF Mono, Fira Code, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  xs: "3px"
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "0.875rem"
  "2xl": "1rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-600}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-500}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.zinc-800}"
    textColor: "{colors.zinc-300}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.zinc-700}"
    textColor: "{colors.zinc-100}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.zinc-400}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
  button-ghost-hover:
    backgroundColor: "{colors.zinc-800}"
    textColor: "{colors.zinc-100}"
  card-default:
    backgroundColor: "{colors.zinc-900}"
    textColor: "{colors.zinc-100}"
    rounded: "{rounded.2xl}"
    padding: "1.25rem"
  card-accent:
    backgroundColor: "{colors.zinc-900}"
    textColor: "{colors.zinc-100}"
    rounded: "{rounded.2xl}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.zinc-800}"
    textColor: "{colors.zinc-100}"
    rounded: "{rounded.lg}"
    padding: "0.625rem 1rem"
  sidebar:
    backgroundColor: "{colors.zinc-900}"
    textColor: "{colors.zinc-300}"
  overlay:
    backgroundColor: "{colors.zinc-800}"
    textColor: "{colors.zinc-100}"
    rounded: "{rounded.lg}"
    padding: "0.5rem"
---

# Design System: bland

## 1. Overview

**Creative North Star: "The Quiet Studio"**

bland is a dark notes editor for developers who live in dark IDEs and want a writing surface that disappears. The aesthetic is sophisticated restraint: a warm, lifted dark palette; a clean studio desk with good lighting; calm focus over visual noise. Typography does the heavy lifting. Color is rationed. Motion is fast — 75ms — and unobtrusive. The product is named bland on purpose; the design is anything but.

This system explicitly rejects generic SaaS surfaces (Intercom-style dashboards, cookie-cutter cards), the lazy "dev tool = monospace + neon + near-black" shorthand, and Notion's exact pixel grammar. It rejects pure dark backgrounds (`#09090b`-class) because they cause halation for astigmatic readers — the lifted canvas is an accessibility requirement, not an aesthetic preference. It rejects gradient buttons, accent-colored shadows, violet-500 stock purple, animated border-hue transitions, and `transition-all`.

The voice is **deadpan, precise, warm**. Visual character lives in micro-copy, type pairing, the 75ms snap, and the deliberate inversion of chrome vs. canvas brightness — never in decoration.

**Key Characteristics:**

- **Lifted warm dark.** Canvas at `#221f21`, never near-black. Zinc palette is warm-shifted (+R, -B) at every stop.
- **Inverted surface hierarchy.** Sidebar (`zinc-900`) is darker than the canvas. Chrome frames; canvas reads.
- **Body weight 450, not 400.** Thicker strokes resist halation.
- **Body line-height 1.7.** Letters get room to breathe.
- **Default transition 75ms.** Not 150ms. Not 300ms.
- **One accent, warm-shifted amethyst (`#9d6ee8`).** Used sparingly — CTAs, links, focus rings, selection. Solid, never gradient.
- **Bricolage Grotesque + Outfit + JetBrains Mono.** No Hanken Grotesk (the limic-shared baseline). bland's display face is the per-project distinctive choice.

## 2. Colors: The Warm Amethyst Palette

A warm-shifted dark palette: zinc neutrals nudged off the cool-blue cast they ship with, paired with a single low-electric amethyst accent. The palette is built around comfort for long reading sessions, not maximum contrast.

### Primary

- **Warm Amethyst** (`#9d6ee8`, `accent-500`): The single accent. Solid hue at ~263°, ~73% saturation, ~67% lightness (warmer than Tailwind violet-500's 271°, lower-sat than its 90%). Carries CTAs (`accent-600` rest, `accent-500` hover), active nav items (`accent-500/10` bg, `accent-400` text), link color in editor body (`accent-400`), focus rings (`accent-500/50`), text selection (`accent-500/28%`), and the brand glyph in the header.

### Neutral: Warm Zinc (10 stops)

The Tailwind `zinc` scale, warm-shifted at every stop (+2–3 R, -1–4 B). The shift is felt, not seen.

- **Canvas** (`#221f21`): Body / main content / editor surface. The brightest baseline in the system — the place the eye should rest. Custom value, sits between stock `zinc-900` and `zinc-800`.
- **zinc-900** (`#1b181a`): Chrome (sidebar, header) and recessed containers (code blocks, table wrappers). Same hex, two roles separated by borders.
- **zinc-800** (`#2a2729`): Elevated surfaces — menus, dialogs, dropdowns, popovers, inputs. Lighter than canvas, gives a floating feel.
- **zinc-700** (`#423f42`): Overlay hover states, borders, scrollbar thumb, blockquote rules. Also `overlay-surface` for floating toolbars and the editor's drag-handle.
- **zinc-600** (`#555259`): Muted icons, disabled states, scrollbar hover.
- **zinc-500** (`#747178`): Muted/placeholder text. Passes WCAG AA against canvas (~5.5:1) — would fail on `zinc-950`.
- **zinc-400** (`#a3a1a8`): Secondary text, blockquote body, footer text.
- **zinc-300** (`#d6d4d7`): Editor body text, near-white secondary headings.
- **zinc-200** (`#e5e4e5`): Inline code text, prominent text.
- **zinc-100** (`#f5f4f4`): Primary body text, headings.
- **zinc-50** / **zinc-950**: Reserved for selection text (`accent-50`) and edge cases.

### Tertiary: Callout Accents

Low-chroma OKLCH hues orbiting the amethyst hue (265°–295°), tuned for comfort over pop. Each conveys callout kind without competing with the accent.

- **Info** (`oklch(0.82 0.06 265)`, approx `#b6c8e6`): Cool slate-blue for `:::info` callouts.
- **Tip** (`oklch(0.89 0.05 295)`, approx `#d8c8eb`): Pale amethyst-adjacent for `:::tip` callouts.
- **Warning** (`oklch(0.82 0.07 62)`, approx `#e2c598`): Muted warm gold for `:::warning` callouts. Low saturation deliberately — not a fire alarm.

### Semantic

Used sparingly, only for state. Pair with icon or label — never color alone.

- **Success** (`emerald-500/10` bg, `emerald-400` text, `emerald-500/20` border).
- **Error** (`red-500/10` bg, `red-400` text, `red-500/20` border).
- **Warning state** (`amber-500/10` bg, `amber-300` text, `amber-500/20` border).
- **Info state** uses `accent-500/10` bg, `accent-400` text — folds into the brand.

### Named Rules

**The One Voice Rule.** The accent is used sparingly — primary CTA, active nav, focus rings, selection, links inside body content. If accent is on more than ~10% of any given screen, something is wrong.

**The Lifted Canvas Rule.** Canvas is `#221f21`, period. Never use stock `zinc-950` (`#09090b`) or any pure-black-class background for content surfaces. The halation justification (astigmatism comfort) ranks above raw contrast scores.

**The Inverted Chrome Rule.** The sidebar is darker than the canvas. Chrome (`zinc-900`) frames from the edges; canvas (`#221f21`) is where the eye rests. Do not "fix" this by lifting the sidebar — the inversion is the design.

**The Warm Shift Rule.** Every neutral stop is warm-shifted off stock Tailwind zinc (+R, -B). When adding new neutrals or hardcoded values in plain CSS, use the warm values — `#1b181a` not `#18181b`, `#2a2729` not `#27272a`. Cool casts on dark surfaces register as clinical even when the user can't name them.

**The No Gradient Accent Rule.** The accent is a solid color, always. `bg-accent-600 hover:bg-accent-500`. No `from-accent-500 to-accent-600`, no accent-colored shadows (`shadow-accent-500/*`). Gradients on the accent read as the AI-generated default.

## 3. Typography

**Display Font:** Bricolage Grotesque Variable (fallback: Outfit Variable, then system sans). A characterful contemporary grotesque — slightly idiosyncratic letterforms that carry the "wit in the details" without shouting. Used only for the largest editor headings.

**Body Font:** Outfit Variable (fallback: ui-sans-serif, system-ui, system stack). A modern variable sans tuned for screen reading at small sizes. Loaded as a variable font specifically so `font-weight: 450` is available — that 50-unit-heavier-than-regular body weight is core to the halation defense.

**Mono Font:** JetBrains Mono (fallback: SF Mono, Fira Code). For code blocks, inline code, and the rare label that needs the developer-native register.

**Character:** Outfit carries the calm-focus voice without being generic. Bricolage adds a small dose of personality at hero sizes. JetBrains Mono is the developer-tool register kept where it belongs — code only, not chrome. No Hanken Grotesk; bland deliberately picks its own display face rather than the shared limic baseline.

### Hierarchy

- **Display** (Bricolage, 700, `1.875rem`/30px, line-height 1.15, tracking -0.025em): Editor H1 / page title only.
- **Headline** (Outfit, 600, `1.5rem`/24px, line-height 1.2, tracking -0.015em): Editor H2.
- **Title** (Outfit, 600, `1.25rem`/20px, line-height 1.3): Editor H3, card titles.
- **Body** (Outfit, **450**, `1rem`/16px, line-height **1.7**, `ss01` + `cv01` enabled): Editor prose. Color `zinc-300`. Heading colors `zinc-100`.
- **Label** (Outfit, 500, `0.75rem`/12px, tracking 0.1em, often uppercase): Overlines, meta labels, caption text. Color `zinc-500`.
- **Mono** (JetBrains Mono, 400, `0.875rem`/14px): Inline code (`zinc-200` text on `zinc-800` bg, `0.25rem` radius, `0.15em 0.35em` padding). Block code in `zinc-900` with `zinc-800` 1px border, `0.5rem` radius.

### Named Rules

**The Body Weight Rule.** Body text is 450, not 400. The 50-unit lift is non-negotiable — it is the primary halation defense. Never set body or paragraph weight below 450. Never use `font-light` or `font-thin` anywhere.

**The 1.7 Line-Height Rule.** Body text in content surfaces (editor, long-form reading) uses line-height 1.7. Tighter ratios save vertical space at the cost of readability for astigmatic users. Tightening is allowed for chrome/UI text where space is the constraint, but the editor surface is sacred.

**The Display-for-Heroes Rule.** Bricolage is reserved for editor H1. Do not extend it to dialog titles, sidebar labels, or marketing copy — its character only carries weight at hero size, and overuse dilutes it.

**The Mono-Is-Code Rule.** JetBrains Mono appears only on code (inline or block) and the rare technical label. Using it anywhere else (entire nav, headings, body copy) is the lazy dev-tool shorthand that PRODUCT.md explicitly rejects.

## 4. Elevation

bland is a **tonal-layered** system, not a shadow-driven one. The four-tier surface hierarchy (chrome / canvas / recessed / elevated) creates depth through value, with borders providing separation where the value differential is too small to read on its own.

Shadows are reserved for the floating layer — popovers, dialogs, dropdowns, the editor's overlay toolbars and drag handle — and even there they stay subtle. Never use `shadow-lg` or `shadow-xl` on interactive surfaces; reserve `shadow-2xl` for modals/dialogs only. Colored accent shadows are forbidden — they read as AI-generated noise.

### Shadow Vocabulary

- **Overlay shadow** (Tailwind `shadow-sm`-class, e.g. `0 1px 2px 0 rgb(0 0 0 / 0.20)`): Drop shadow under floating toolbars, dropdowns, drag handles. Subtle.
- **Dialog shadow** (Tailwind `shadow-2xl`-class): Reserved for modals and full-overlay dialogs only.
- **No card hover shadow by default.** Cards lift via `hover:-translate-y-0.5` and border tone, not shadow growth.

### Named Rules

**The Tonal-First Rule.** Depth comes from value first (chrome darker than canvas, elevated lighter than canvas), borders second, shadows third. If you reach for a shadow before exhausting the surface stack, you're solving the wrong problem.

**The Subtle Shadow Rule.** Any shadow used is at `shadow-sm` weight unless the element is a modal. Colored shadows (`shadow-accent-500/*`, `shadow-purple-500/*`) are prohibited — they identify the design as AI-generated and add noise without affordance.

## 5. Components

### Buttons

- **Shape:** Rounded corners — `rounded-md` (`0.5rem`) for most variants, `rounded-lg` (`0.75rem`) on larger CTAs. Avoid pill (`rounded-full`) outside of icon-only utility buttons.
- **Primary** (`bg-accent-600 text-white hover:bg-accent-500 active:scale-[0.98]`): Solid accent, no gradient. White text. Padding `0.5rem 1rem` (md) / `0.375rem 0.75rem` (sm).
- **Secondary** (`border border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60`): Subtle border, elevated tone, never accent.
- **Danger** (`border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20`): Tinted, not solid. Carries the destructive read without competing visually with the primary CTA.
- **Ghost** (`text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100`): No border, no background at rest. Used for utility actions in dense UI (editor toolbars, row actions).
- **Press feedback:** `active:scale-[0.98]` on primary/secondary/danger, `active:scale-[0.97]` on ghost. Transition: `transition-transform` (not `transition-all`).
- **Focus:** Inherits the global `*:focus-visible` rule (`ring-2 ring-accent-500/50 ring-offset-2 ring-offset-canvas`).
- **Source of truth.** The class strings live in `src/client/components/ui/button-classes.ts`. Both `<Button>` and the link-shaped CTAs that render `<a href>` for top-level navigation (e.g. the OIDC sign-in hand-off) consume the same tokens. Never reconstruct primary-button classes inline at the call site — that's how the brand shade drifts a rung lighter. The `// ADR:` block at the top of `button-classes.ts` covers the rationale.

### Cards / Containers

- **Default** (`rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-5 sm:p-6`): Default card. `zinc-900/50` background lets the canvas warmth show through.
- **Accent** (`rounded-2xl border border-accent-500/20 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-5 sm:p-6`): Subtle accent-tinted border. The "gradient" here is between two zinc tones, not accent stops — that's allowed.
- **Hover (interactive)**: `hover:-translate-y-0.5 transition-transform cursor-pointer`. No shadow grow. No border hue shift.
- **Border tone instead of hue:** Lighten within the same hue family on hover (`hover:border-zinc-700/60`). Never animate zinc → accent border transitions — the intermediate tones look wrong even at 75ms.

### Inputs / Fields

- **Style** (`w-full rounded-xl border border-zinc-700/60 bg-zinc-800/80 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500`): Elevated tier background, soft border. Pill-ish radius (`rounded-xl` / `0.875rem`).
- **Focus** (`focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 focus:outline-none`): Border tint shift + thin ring. The keyboard-only `*:focus-visible` rule adds the stronger 2px ring with canvas offset.
- **Error:** `border-red-500/40` plus a `text-red-400` helper line beneath the field.

### Navigation

- **Header** (`sticky top-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800/60`): Chrome tier. `backdrop-blur-sm` (4px) only — never `backdrop-blur-xl`. Container `max-w-7xl mx-auto px-4 sm:px-6`.
- **Sidebar:** Chrome tier (`zinc-900` / `#1b181a`), darker than canvas. Border-right for separation. Items use `text-zinc-300` rest, `bg-accent-500/10 text-accent-400` when active.
- **Brand glyph:** Lucide icon, `text-accent-400`, no filled background tile. Hover `group-hover:-rotate-6` is the signature micro-interaction — preserve it.

### Editor Surface (signature component)

The editor is bland's reason to exist. Treat it as the most polished surface in the system.

- **Background:** `canvas` (`#221f21`). No card chrome around it, no inset border.
- **Body text:** Outfit 450 / 16px / line-height 1.7, color `zinc-300`. Heading colors `zinc-100`.
- **Inline code:** JetBrains Mono, `0.875em`, `zinc-800` background, `zinc-200` text, `0.25rem` radius, `0.15em 0.35em` padding.
- **Block code:** `zinc-900` background, `1px solid zinc-800` border, `0.5rem` radius, `0.75rem 1rem` padding. Horizontal scroll on overflow.
- **Links:** `accent-400` color, underlined, `text-underline-offset: 2px`. Hover lifts to `accent-300`.
- **Blockquote:** 3px solid `zinc-700` left border, `zinc-400` body color, `1rem` left padding.
- **HR:** Single 1px `zinc-700` line, `1.5rem 0` vertical spacing — never a stylized divider.
- **Task list checkbox:** 16×16, `zinc-500` 2px border at rest, fills `accent-500` when checked (white check inside). 3px radius.
- **Caret blink:** 1.1s steps(2, start) — slower than the OS default for calm rhythm.
- **Floating toolbars / drag handle:** `overlay-surface` (`zinc-700`) background, sit above the canvas via subtle shadow, not value.

### Callouts (signature component)

`:::info`, `:::tip`, `:::warning` blocks use the low-chroma OKLCH palette specifically tuned for astigmatism comfort. Background is a low-opacity wash of the callout color; left rule (3px) carries the saturated hue; body text stays `zinc-300`. Never invent additional callout kinds without extending the palette through the same comfort lens.

### Toasts

- **Position:** `fixed bottom-4 right-4 z-[100]`.
- **Animation:** `animate-slide-up` (0.35s ease-out, 12px from below).
- **Auto-dismiss:** 4 seconds.
- **Variants:** success (emerald), error (red), info (accent). ARIA `role="status"` + `aria-live="polite"` (errors: `aria-live="assertive"`).

### Focus Ring

Global: `outline-none ring-2 ring-accent-500/50 ring-offset-2 ring-offset-canvas` on every `*:focus-visible`. The `ring-offset-canvas` matches the body background, creating a gap between element and ring. Do not add per-element focus rings unless suppressing the default (inline-editable titles only).

## 6. Do's and Don'ts

### Do:

- **Do** use the lifted canvas (`#221f21`) as the body background. Body text weight 450, line-height 1.7 on content surfaces.
- **Do** keep the sidebar darker than the canvas (`zinc-900`). The inverted chrome is the design.
- **Do** use the warm-shifted zinc values (`#1b181a`, `#2a2729`, `#423f42`, …) — never stock zinc — when hardcoding hex in plain CSS.
- **Do** use the solid accent for CTAs (`bg-accent-600 hover:bg-accent-500`) and ration it — ~10% of any screen, max.
- **Do** override transition duration to 75ms via `--default-transition-duration`. Scope transitions to the exact properties that change (`transition-colors`, `transition-transform`, `transition-[border-color,box-shadow]`).
- **Do** prefer tonal layering (surface stack) over shadows for depth. Reserve `shadow-sm` for floating UI, `shadow-2xl` for modals.
- **Do** stagger entrance animations at 60ms increments, capped at 8 items.
- **Do** keep wit in micro-copy — empty states, loading lines, error messages — never in decoration.
- **Do** respect `prefers-reduced-motion` via the global rule in `app.css`.

### Don't:

- **Don't** use pure dark backgrounds (`#09090b` / stock `zinc-950`) for content surfaces. Causes halation. PRODUCT.md anti-reference.
- **Don't** ship "generic SaaS" surfaces — Intercom-style dashboards, cookie-cutter cards, stock illustrations. PRODUCT.md anti-reference.
- **Don't** lean on "monospace-everything-dark-mode-neon" as a shorthand for "dev tool." PRODUCT.md anti-reference. Mono is for code only.
- **Don't** try to be a pixel-perfect Notion clone. bland is self-aware about the resemblance and owns its own grammar. PRODUCT.md anti-reference.
- **Don't** use violet-500 (`#8b5cf6`) or any stock Tailwind purple as the accent — it is the most-recognizable AI-generated color choice. The amethyst accent is hue-shifted warmer and de-saturated for a reason.
- **Don't** use gradient buttons (`from-accent-500 to-accent-600`) or accent-colored shadows (`shadow-accent-500/10`). Solid color, subtle shadow only.
- **Don't** animate border hue shifts (zinc → accent via `transition-colors`). The intermediate tones look unnatural even at 75ms. Lighten within the same hue family instead.
- **Don't** use `transition-all` ever. Scope to actual properties.
- **Don't** use `font-light` or `font-thin` anywhere. Insufficient contrast on dark surfaces; halation makes thin strokes unreadable for astigmatic users.
- **Don't** use `hover:brightness-*` on gradient buttons. Forces per-frame GPU gradient recompute.
- **Don't** use `backdrop-blur-xl` (24px). `backdrop-blur-sm` (4px) is plenty and ~6x cheaper per frame.
- **Don't** add `position: fixed` pseudo-element background layers (`body::before` glow). Apply ambient gradients directly to `body`'s `background-image`.
- **Don't** wrap marketing copy in `<Card>` primitives. Cards are for real content (pages, attachments), not decoration.
- **Don't** use `zinc-600` for semantically meaningful text — insufficient contrast against any dark background.
- **Don't** rely on color alone for state — pair with icon or label.
