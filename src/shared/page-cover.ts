export const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #5e3497 0%, #2a2729 100%)",
  "linear-gradient(135deg, #4d2a7c 0%, #1b181a 100%)",
  "linear-gradient(135deg, #423f42 0%, #2a2729 100%)",
  "linear-gradient(135deg, #7241b8 0%, #423f42 100%)",
  "linear-gradient(135deg, #2a2729 0%, #5e3497 50%, #2a2729 100%)",
  "linear-gradient(135deg, #3d2d4a 0%, #1b181a 100%)",
  "linear-gradient(135deg, #2a2729 0%, #352530 100%)",
  "linear-gradient(135deg, #423f42 0%, #3d2d4a 50%, #2a2729 100%)",
  "linear-gradient(135deg, #8854d4 0%, #2a2729 100%)",
  "linear-gradient(135deg, #1b181a 0%, #423f42 100%)",
  "linear-gradient(135deg, #352530 0%, #423f42 100%)",
  "linear-gradient(135deg, #2a2729 0%, #4d2a7c 50%, #1b181a 100%)",
] as const;

export type GradientPreset = (typeof GRADIENT_PRESETS)[number];

const GRADIENT_PRESET_SET = new Set<string>(GRADIENT_PRESETS);
const UPLOAD_COVER_URL = /^\/uploads\/([A-Za-z0-9_-]+)$/;

export function isGradientPreset(value: string): value is GradientPreset {
  return GRADIENT_PRESET_SET.has(value);
}

export function parseUploadCoverUrl(coverUrl: string): string | null {
  return UPLOAD_COVER_URL.exec(coverUrl)?.[1] ?? null;
}
