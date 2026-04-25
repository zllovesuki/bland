import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { serwist } from "@serwist/vite";
import path from "path";
import { cpSync, existsSync } from "node:fs";

// Captured once per build. Used as the revision for the precached Worker
// rendered shell so every deploy refreshes the offline fallback copy.
const SHELL_PRECACHE_REVISION = Date.now().toString(36);

// Non-user-facing URL for the precached shell. Using a URL that no visitor
// ever navigates to keeps Serwist's precache route (registered before any
// runtime route) from intercepting real `/` navigations; that would serve
// an install-time cached shell to online users, reintroducing the stale
// deploy hazard. The Worker treats any non-asset, non-api GET path as the
// SPA shell (see `src/worker/lib/http-entry.ts`), so this path resolves to
// `renderSpaShell` at SW install time.
const SHELL_PRECACHE_URL = "/__pwa-shell";

const persistStatePath = process.env.BLAND_PERSIST_STATE_PATH;
const ignoredWatchPaths = ["docs/**", "scripts/**", "playwright-report/**", "test-results/**", "tests/**"];
const fontAssetPattern = /\.(?:woff2?|ttf|otf|eot)$/i;

// Excalidraw defaults to fetching its font .woff2 files from esm.sh. Self-host
// by copying `dist/prod/fonts/*` from node_modules into `public/fonts/`; at
// mount time we set `window.EXCALIDRAW_ASSET_PATH = "/"` so Excalidraw's
// internal `@font-face` URLs resolve against same-origin. Runs during
// `configureServer` (dev) and `buildStart` (build) so both `npm run dev` and
// `npm run build` pick up the assets. The esm.sh origin stays in CSP
// `font-src` as a fallback; see `src/worker/lib/security-headers.ts`.
function excalidrawFontsPlugin(): Plugin {
  const src = path.resolve(__dirname, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
  const dest = path.resolve(__dirname, "public/fonts");
  const copy = () => {
    if (!existsSync(src)) return;
    cpSync(src, dest, { recursive: true, force: false });
  };
  return {
    name: "excalidraw-fonts-copy",
    configureServer: copy,
    buildStart: copy,
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    excalidrawFontsPlugin(),
    cloudflare({
      ...(persistStatePath ? { persistState: { path: persistStatePath } } : {}),
    }),
    serwist({
      swSrc: "src/client/service-worker.ts",
      // Serwist runs in Vite's client build, whose outDir is `dist/client`.
      swDest: "sw.js",
      swUrl: "/sw.js",
      scope: "/",
      type: "classic",
      rollupFormat: "iife",
      injectionPoint: "self.__SW_MANIFEST",
      globDirectory: "dist/client",
      // Precache a fetched copy of the Worker-rendered shell at SW install so
      // an installed app launched offline still boots. The revision changes per
      // build so each deploy refreshes the entry. See `SHELL_PRECACHE_URL` for
      // why the URL is non-user-facing.
      additionalPrecacheEntries: [{ url: SHELL_PRECACHE_URL, revision: SHELL_PRECACHE_REVISION }],
      // The Excalidraw vendor chunk is ~4.75 MB; raising the default 2 MB cap
      // so the canvas still works offline (goal: cache all assets).
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      globPatterns: ["**/*.{js,css,woff,woff2,ttf,png,svg,ico,webmanifest,json}"],
      globIgnores: ["**/index.html", "**/sw.js", "**/workbox-*.js"],
    }),
  ],
  server: {
    watch: {
      ignored: ignoredWatchPaths,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    assetsInlineLimit: (filePath) => (fontAssetPattern.test(filePath) ? false : undefined),
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (/[\\/]prosemirror-|[\\/]@tiptap[\\/]pm[\\/]/.test(id)) return "vendor-prosemirror";
          if (/[\\/]@tiptap[\\/]/.test(id)) return "vendor-tiptap";
          if (/[\\/](yjs|y-protocols|y-indexeddb|y-partyserver|partysocket|lib0)[\\/]/.test(id)) return "vendor-yjs";
          if (/[\\/]@sentry[\\/]/.test(id)) return "vendor-sentry";
          if (/[\\/]@excalidraw[\\/]/.test(id)) return "vendor-excalidraw";
        },
      },
    },
  },
});
