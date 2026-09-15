// Runtime-safe image metadata used by both editor extensions and static presentation.
// Keep this file free of Tiptap imports so public Sites islands can use it.

export type ImageAlign = "left" | "center" | "right";

export function normalizeImageAlign(value: unknown): ImageAlign {
  return value === "center" || value === "right" ? value : "left";
}

export const MIN_IMAGE_BRIGHTNESS = 25;
export const MAX_IMAGE_BRIGHTNESS = 100;

export function normalizeImageBrightness(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number)
    ? Math.round(Math.max(MIN_IMAGE_BRIGHTNESS, Math.min(MAX_IMAGE_BRIGHTNESS, number)))
    : MAX_IMAGE_BRIGHTNESS;
}
