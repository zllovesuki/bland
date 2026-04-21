import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { cpSync, existsSync } from "node:fs";

const persistStatePath = process.env.BLAND_PERSIST_STATE_PATH;
const ignoredWatchPaths = ["docs/**", "scripts/**", "playwright-report/**", "test-results/**", "tests/**"];

// Excalidraw defaults to fetching its font .woff2 files from esm.sh, which
// our CSP blocks (font-src: self + fonts.gstatic.com). Self-host by copying
// `dist/prod/fonts/*` from node_modules into `public/fonts/`; at mount time
// we set `window.EXCALIDRAW_ASSET_PATH = "/"` so Excalidraw's internal
// `@font-face` URLs resolve against same-origin. Runs during `configureServer`
// (dev) and `buildStart` (build) so both `npm run dev` and `npm run build`
// pick up the assets.
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
    cloudflare(persistStatePath ? { persistState: { path: persistStatePath } } : undefined),
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
