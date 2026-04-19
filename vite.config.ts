import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

const persistStatePath = process.env.BLAND_PERSIST_STATE_PATH;
const ignoredWatchPaths = ["docs/**", "scripts/**", "playwright-report/**", "test-results/**", "tests/**"];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
        },
      },
    },
  },
});
