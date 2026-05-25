import { describe, expect, it } from "vitest";

import { GRADIENT_PRESETS, isGradientPreset, parseUploadCoverUrl } from "@/shared/page-cover";
import {
  createSiteCoverHash,
  isOgImageType,
  parseGradient,
  SITE_COVER_HEIGHT,
  SITE_COVER_WIDTH,
} from "@/worker/sites/cover";

describe("Sites cover helpers", () => {
  it("creates a stable hash that changes when cover inputs change", async () => {
    const first = await createSiteCoverHash(GRADIENT_PRESETS[0]);
    const repeat = await createSiteCoverHash(GRADIENT_PRESETS[0]);
    const changed = await createSiteCoverHash(GRADIENT_PRESETS[1]);

    expect(first).toBe(repeat);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("parses only exact upload cover URLs", () => {
    expect(parseUploadCoverUrl("/uploads/upload_abc-123")).toBe("upload_abc-123");
    expect(parseUploadCoverUrl("/uploads/")).toBeNull();
    expect(parseUploadCoverUrl("/uploads/abc/extra")).toBeNull();
    expect(parseUploadCoverUrl("https://example.com/uploads/abc")).toBeNull();
  });

  it("classifies only OG-safe upload content types", () => {
    expect(isOgImageType("image/png")).toBe(true);
    expect(isOgImageType("image/jpeg; charset=binary")).toBe(true);
    expect(isOgImageType("image/webp")).toBe(true);
    expect(isOgImageType("image/gif")).toBe(true);
    expect(isOgImageType("image/heic")).toBe(false);
    expect(isOgImageType("application/pdf")).toBe(false);
  });

  it("parses every shared gradient preset", () => {
    for (const preset of GRADIENT_PRESETS) {
      const parsed = parseGradient(preset);
      expect(isGradientPreset(preset)).toBe(true);
      expect(parsed?.stops.length).toBeGreaterThanOrEqual(2);
      expect(parsed?.stops[0].position).toBeGreaterThanOrEqual(0);
      expect(parsed?.stops.at(-1)?.position).toBeLessThanOrEqual(100);
    }
  });

  it("rejects unsupported gradient CSS and clamps explicit stop positions", () => {
    expect(parseGradient("radial-gradient(#000 0%, #fff 100%)")).toBeNull();
    expect(parseGradient("linear-gradient(to right, #000 0%, #fff 100%)")).toBeNull();
    expect(parseGradient("linear-gradient(90deg, red 0%, blue 100%)")).toBeNull();
    expect(parseGradient("linear-gradient(90deg, #000, #fff)")).toBeNull();

    const parsed = parseGradient("linear-gradient(90deg, #000 -10%, #ffffff 110%)");
    expect(parsed?.stops.map((stop) => stop.position)).toEqual([0, 100]);
  });

  it("keeps generated cover dimensions fixed", () => {
    expect(SITE_COVER_WIDTH).toBe(1200);
    expect(SITE_COVER_HEIGHT).toBe(630);
  });
});
