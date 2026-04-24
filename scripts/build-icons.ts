import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const OUT = resolve(ROOT, "public/icons");

const BG = "#171717";
const FG = "#A78BFA";

type Variant = {
  contentScale: number;
  strokeScale: number;
  strokeLinecap: "round" | "butt" | "square";
};

const FULL: Variant = { contentScale: 0.82, strokeScale: 1, strokeLinecap: "round" };
const MASKABLE: Variant = { contentScale: 0.6, strokeScale: 1, strokeLinecap: "round" };
const TINY: Variant = { contentScale: 0.92, strokeScale: 1.45, strokeLinecap: "butt" };

function buildSvg(size: number, v: Variant, transparent = false): string {
  const glyphW = 16;
  const glyphH = 18;
  const scale = (size * v.contentScale) / Math.max(glyphW, glyphH);
  const tx = size / 2 - 12 * scale;
  const ty = size / 2 - 12 * scale;
  const stroke = 2 * v.strokeScale;
  const bgRect = transparent ? "" : `  <rect width="${size}" height="${size}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bgRect}
  <g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(4)})"
     fill="none" stroke="${FG}" stroke-width="${stroke}"
     stroke-linecap="${v.strokeLinecap}" stroke-linejoin="round">
    <path d="M13 4v16"/>
    <path d="M17 4v16"/>
    <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>
  </g>
</svg>`;
}

async function renderPng(svg: string, size: number, opts: { alpha?: boolean } = {}): Promise<Buffer> {
  const supersample = size < 64 ? 4 : 2;
  const source = buildSvgFromString(svg, size * supersample);
  let pipeline = sharp(Buffer.from(source)).resize(size, size, {
    kernel: sharp.kernel.lanczos3,
  });
  if (opts.alpha === false) {
    pipeline = pipeline.flatten({ background: BG });
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

function buildSvgFromString(svg: string, newSize: number): string {
  return svg.replace(/width="\d+"\s+height="\d+"/, `width="${newSize}" height="${newSize}"`);
}

function buildIco(pngs: Buffer[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = Buffer.alloc(16 * pngs.length);
  const sizes = [16, 32, 48];
  let offset = header.length + entries.length;
  pngs.forEach((png, i) => {
    const size = sizes[i];
    const base = i * 16;
    entries.writeUInt8(size === 256 ? 0 : size, base + 0);
    entries.writeUInt8(size === 256 ? 0 : size, base + 1);
    entries.writeUInt8(0, base + 2);
    entries.writeUInt8(0, base + 3);
    entries.writeUInt16LE(1, base + 4);
    entries.writeUInt16LE(32, base + 6);
    entries.writeUInt32LE(png.length, base + 8);
    entries.writeUInt32LE(offset, base + 12);
    offset += png.length;
  });

  return Buffer.concat([header, entries, ...pngs]);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const canonicalSvg = buildSvg(512, FULL, true);
  writeFileSync(resolve(OUT, "icon.svg"), canonicalSvg);

  const targets: Array<{
    name: string;
    size: number;
    variant: Variant;
    alpha: boolean;
  }> = [
    { name: "favicon-16x16.png", size: 16, variant: TINY, alpha: true },
    { name: "favicon-32x32.png", size: 32, variant: FULL, alpha: true },
    { name: "apple-touch-icon.png", size: 180, variant: FULL, alpha: false },
    { name: "icon-192.png", size: 192, variant: FULL, alpha: false },
    { name: "icon-512.png", size: 512, variant: FULL, alpha: false },
    { name: "icon-192-maskable.png", size: 192, variant: MASKABLE, alpha: false },
    { name: "icon-512-maskable.png", size: 512, variant: MASKABLE, alpha: false },
  ];

  for (const t of targets) {
    const svg = buildSvg(t.size, t.variant, t.alpha);
    const png = await renderPng(svg, t.size, { alpha: t.alpha });
    writeFileSync(resolve(OUT, t.name), png);
    console.log(`wrote ${t.name} (${png.length} bytes)`);
  }

  const icoSizes: Array<{ size: number; variant: Variant }> = [
    { size: 16, variant: TINY },
    { size: 32, variant: FULL },
    { size: 48, variant: FULL },
  ];
  const icoPngs = await Promise.all(
    icoSizes.map(({ size, variant }) => renderPng(buildSvg(size, variant, true), size, { alpha: true })),
  );
  const ico = buildIco(icoPngs);
  writeFileSync(resolve(OUT, "favicon.ico"), ico);
  console.log(`wrote favicon.ico (${ico.length} bytes, ${icoPngs.length} sizes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
