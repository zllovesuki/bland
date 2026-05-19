import {
  SITES_BROWSER_ENTRY,
  SITES_FONTS_ENTRY,
  SITES_FONTS_SOURCE,
  SITES_STYLES_ENTRY,
  SITES_STYLES_SOURCE,
} from "@/shared/sites/entrypoints";
import type { SiteDocumentAssets } from "@/sites/types";

interface ViteManifestEntry {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

type ViteManifest = Record<string, ViteManifestEntry>;

export interface SitesAssetIndex {
  // Request-time document asset URLs. These are deploy-specific, but they are
  // not persisted in Sites artifacts now that R2 stores render JSON instead of
  // full HTML.
  documentAssets: SiteDocumentAssets;
}

// Source path served by the Vite dev server during `npm run dev` (no build
// manifest exists), so Vite's CSS pipeline processes @imports and Tailwind in
// flight.
const SITES_MANIFEST_PATH = "/sites-manifest.json";

let cachedIndexPromise: Promise<SitesAssetIndex | null> | null = null;

function toPathname(path: string | undefined): string | null {
  if (!path) return null;
  return path.startsWith("/") ? path : `/${path}`;
}

function readStylesheetPath(entry: ViteManifestEntry | undefined): string | undefined {
  if (!entry) return undefined;
  return entry.css?.[0] ?? (entry.file.endsWith(".css") ? entry.file : undefined);
}

function getChunk(manifest: ViteManifest, key: string | undefined): ViteManifestEntry | null {
  if (!key) return null;
  return manifest[key] ?? null;
}

function collectScriptGraph(
  manifest: ViteManifest,
  key: string,
): { scriptSrc: string | null; modulePreloadHrefs: string[] } {
  const visited = new Set<string>();
  const preloadHrefs: string[] = [];
  const scriptEntry = getChunk(manifest, key);
  const scriptSrc = toPathname(scriptEntry?.file);

  function visitImport(importKey: string, preload: boolean): void {
    if (visited.has(importKey)) return;
    visited.add(importKey);

    const entry = getChunk(manifest, importKey);
    if (!entry) return;

    for (const child of entry.imports ?? []) visitImport(child, preload);
    for (const child of entry.dynamicImports ?? []) visitImport(child, false);

    const href = toPathname(entry.file);
    if (preload && href) preloadHrefs.push(href);
  }

  for (const importKey of scriptEntry?.imports ?? []) visitImport(importKey, true);
  for (const importKey of scriptEntry?.dynamicImports ?? []) visitImport(importKey, false);

  return { scriptSrc, modulePreloadHrefs: preloadHrefs };
}

async function loadIndex(env: Pick<Env, "ASSETS">): Promise<SitesAssetIndex | null> {
  const response = await env.ASSETS.fetch(new Request(`https://assets.local${SITES_MANIFEST_PATH}`));
  if (!response.ok) return null;

  const manifest = (await response.json()) as ViteManifest;
  const stylesEntry = manifest[SITES_STYLES_ENTRY];
  const fontsEntry = manifest[SITES_FONTS_ENTRY];
  const cssRel = readStylesheetPath(stylesEntry);
  const fontCssRel = readStylesheetPath(fontsEntry);
  if (!cssRel || !fontCssRel) return null;

  const stylesheetHref = toPathname(cssRel);
  const fontStylesheetHref = toPathname(fontCssRel);
  if (!stylesheetHref || !fontStylesheetHref) return null;

  const { scriptSrc, modulePreloadHrefs } = collectScriptGraph(manifest, SITES_BROWSER_ENTRY);
  if (!scriptSrc) return null;

  return {
    documentAssets: {
      stylesheetHref,
      fontStylesheetHref,
      scriptSrc,
      modulePreloadHrefs,
    },
  };
}

export function getSitesAssetIndex(env: Pick<Env, "ASSETS">): Promise<SitesAssetIndex | null> {
  if (!cachedIndexPromise) {
    cachedIndexPromise = loadIndex(env).catch((err) => {
      cachedIndexPromise = null;
      throw err;
    });
  }
  return cachedIndexPromise;
}

export function resetSitesManifestCacheForTests(): void {
  cachedIndexPromise = null;
}

function getDevDocumentAssets(): SiteDocumentAssets {
  return {
    stylesheetHref: `/${SITES_STYLES_SOURCE}?direct`,
    fontStylesheetHref: `/${SITES_FONTS_SOURCE}?direct`,
    scriptSrc: `/${SITES_BROWSER_ENTRY}`,
    modulePreloadHrefs: [],
  };
}

export async function resolveSitesDocumentAssets(env: Pick<Env, "ASSETS">): Promise<SiteDocumentAssets | null> {
  const index = await getSitesAssetIndex(env);
  if (index) return index.documentAssets;
  if (import.meta.env.DEV) return getDevDocumentAssets();
  return null;
}
