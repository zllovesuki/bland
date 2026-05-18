import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

import { sitesEntrypoints } from "./src/sites/entrypoints";

const fontAssetPattern = /\.(?:woff2?|ttf|otf|eot)$/i;

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    assetsDir: "site-assets",
    assetsInlineLimit: (filePath) => (fontAssetPattern.test(filePath) ? false : undefined),
    chunkSizeWarningLimit: 1000,
    manifest: "sites-manifest.json",
    rollupOptions: {
      input: sitesEntrypoints,
    },
  },
});
