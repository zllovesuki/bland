export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  href?: string;
}

export interface OutlineViewportHeading<TId extends string | number> {
  id: TId;
  top: number;
  bottom: number;
  hidden?: boolean;
}

export interface OutlineViewportBounds {
  top: number;
  height: number;
}

const OUTLINE_ACTIVATION_ZONE_FRACTION = 0.4;
const OUTLINE_ACTIVATION_ZONE_MAX_PX = 480;
const OUTLINE_MIN_VISIBLE_BELOW_PX = 16;

export function normalizeOutlineText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function readOutlineLevel(value: unknown): number {
  const level = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
}

export function createUniqueOutlineAnchorId(text: string, used: Set<string>): string {
  const base = slugifyOutlineText(normalizeOutlineText(text)) || "section";
  let id = base;
  let suffix = 2;

  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(id);
  return id;
}

function slugifyOutlineText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveViewportActiveOutlineHeading<TId extends string | number>(
  headings: readonly OutlineViewportHeading<TId>[],
  viewport: OutlineViewportBounds,
): TId | null {
  const viewportTop = viewport.top;
  const viewportBottom = viewportTop + viewport.height;
  const activationBottom =
    viewportTop + Math.min(viewport.height * OUTLINE_ACTIVATION_ZONE_FRACTION, OUTLINE_ACTIVATION_ZONE_MAX_PX);
  const visibleBelowCutoff = viewportBottom - OUTLINE_MIN_VISIBLE_BELOW_PX;

  let intersectingTop: TId | null = null;
  let firstInActivation: TId | null = null;
  let firstVisibleBelow: TId | null = null;
  let lastAboveTop: TId | null = null;

  // Priority chain:
  // 1. A heading still crossing the top edge (we're reading just below it).
  // 2. First heading inside the activation zone (top 40%, <=480px).
  // 3. First heading sufficiently visible below the activation zone, which
  //    handles the case where the previous section is fully behind us and the
  //    next heading is the only anchor on screen.
  // 4. Last heading that scrolled past the top (long-section fallback).
  for (const heading of headings) {
    if (heading.hidden) continue;

    if (heading.bottom <= viewportTop) {
      lastAboveTop = heading.id;
    } else if (heading.top < viewportTop) {
      intersectingTop = heading.id;
      lastAboveTop = heading.id;
    } else if (heading.top <= activationBottom) {
      if (firstInActivation === null) firstInActivation = heading.id;
    } else if (heading.top <= visibleBelowCutoff) {
      firstVisibleBelow = heading.id;
      break;
    } else {
      break;
    }
  }

  return intersectingTop ?? firstInActivation ?? firstVisibleBelow ?? lastAboveTop;
}
