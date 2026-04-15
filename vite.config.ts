import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

const persistStatePath = process.env.BLAND_PERSIST_STATE_PATH;
const ignoredWatchPaths = ["docs/**", "scripts/**", "playwright-report/**", "test-results/**"];

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
});
