## Design Context

### Users

Developers on teams who want a place to put down their notes. They live in dark IDEs all day, switch between terminals and browsers, and value tools that stay out of the way. They don't want to think about the tool — they want to think about what they're writing.

**Primary use case**: Quick notes — jotting things down fast, organizing with a page tree, sharing with teammates.
**Secondary use case**: Occasional long-form writing (blog drafts, technical essays) where the editor surface needs to feel comfortable for extended sessions.

### Brand Personality

**Voice**: Self-aware, ironic, quietly confident. bland knows it's a Notion-alike and doesn't pretend otherwise — but it owns that with humor. The name is the joke: the product is anything but bland. Think: a developer who shows up in a plain black t-shirt that happens to be perfectly cut.

**3 words**: Deadpan. Precise. Warm.

**Emotional goal**: Calm focus. The interface should feel like sitting down at a clean desk with good lighting — no friction, no noise, just space to think.

### Aesthetic Direction

**Tone**: Sophisticated restraint with dry wit in the details. Not minimal for minimalism's sake — every element earns its place, but the ones that are there have real craft behind them. The typography should do the heavy lifting. Color should be used sparingly and with purpose.

**References**:

- **jam.dev** — Sharp, precise, developer-native. bland should feel this confident and intentional.
- **charm.land** — Playful, energetic, personality-forward. bland should borrow the _warmth_ and _character_ without the sugar rush.
- The sweet spot is jam's precision with charm's soul.

**Anti-references**:

- Generic SaaS (Intercom-style dashboards, cookie-cutter landing pages, stock illustrations)
- Notion itself — bland is self-aware about the resemblance, not trying to be a pixel-perfect clone
- "Developer tool that forgot developers have taste" — gray boxes with no personality

**Theme**: Dark mode, but with a critical constraint — see Accessibility below.

### Accessibility

**Primary constraint**: The creator has astigmatism. This directly shapes the dark-mode design:

- Pure dark backgrounds with thin light text cause **halation** — light text blooms and blurs against very dark surfaces for people with astigmatism.
- But full light mode is "too brutal" — the high brightness is fatiguing.
- **Design response**: Favor a **lifted dark** palette over near-black. Use slightly heavier body text weights to counteract halation. Avoid thin, high-contrast text on very dark surfaces. Aim for comfortable readability, not maximum contrast.
- Body text should have generous line-height — letters need room to breathe.
- Neutrals should carry subtle warm tinting to reduce the clinical edge of cool gray.

**Sidebar darkness is intentional**: The sidebar is darker than the canvas, inverting the typical surface hierarchy by design. The darker sidebar creates an IDE-like chrome frame that recedes visually, keeping focus on the editor canvas. It can be collapsed if distracting.

**Standard**: Follow WCAG AA as a baseline, but prioritize _comfortable_ readability for astigmatic users over raw contrast ratios. Sometimes AA-passing contrast on near-black backgrounds is technically compliant but physically uncomfortable.

_Specific token values (canvas hex, surface stack, body weight, line-height, transition durations) live in `DESIGN.md`._

### Design Principles

1. **Earn every pixel.** If an element doesn't help the user write, navigate, or share, it shouldn't be there. But the elements that _are_ there should be crafted with real care — typography, spacing, transitions.

2. **Comfort over contrast.** Dark mode should feel like a well-lit room at dusk, not a terminal at midnight. Lifted backgrounds, generous spacing, slightly heavier text weights. The interface should be comfortable for hours, not just minutes.

3. **Personality lives in the details.** bland's character comes through in micro-copy, transition timing, and typographic choices — not in flashy gradients or decorative elements. The wit is dry, not loud.

4. **Developer-native, not developer-generic.** Developers have taste. Respect that with precise typography, intentional color, and interactions that feel snappy. But don't lean on monospace-everything-dark-mode-neon as a lazy shorthand for "dev tool."

5. **The name is the bit.** bland is self-aware. It can wink at the user occasionally — in empty states, loading copy, error messages — without being annoying about it. The humor is a spice, not the main course.
