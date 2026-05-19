import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".reference/**",
      "playwright-report/**",
      "test-results/**",
      "worker-configuration.d.ts",
      "src/client/lib/emoji/generated/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // TypeScript's noUnusedLocals/noUnusedParameters are authoritative here.
      // Keep ESLint focused on React Compiler and runtime-safety rules.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/client/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/sites/**", "@/worker/**"],
              message: "Client code must use shared contracts instead of importing Sites server or Worker modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/sites/**/*.{js,ts,tsx}", "src/worker/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/client/**", "@/shared/browser/**"],
              message: "Worker and Sites server code must stay free of client and browser-only shared modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/client/**", "@/sites/**", "@/worker/**"],
              message: "Shared modules must not depend on runtime-specific client, Sites server, or Worker modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}", "src/shared/browser/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
  },
  {
    files: ["src/client/**/*.tsx"],
    ...reactRefresh.configs.vite,
  },
);
