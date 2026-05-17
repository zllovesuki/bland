import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { countCharacters, countWords, createHeadlessEditorExtensions } from "@/shared/editor/schema";

const SHARED_EDITOR_SCHEMA_DIR = fileURLToPath(new URL("../../src/shared/editor/schema/", import.meta.url));

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = `${dir}${entry}`;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(`${path}/`));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

describe("headless shared editor schema", () => {
  it("imports in the Node shared test runtime without a browser global", () => {
    expect(globalThis.document).toBeUndefined();
    const schema = getSchema(createHeadlessEditorExtensions());

    expect(schema.nodes.callout).toBeDefined();
    expect(schema.nodes.codeBlock).toBeDefined();
    expect(schema.nodes.image).toBeDefined();
    expect(schema.nodes.pageMention).toBeDefined();
    expect(schema.nodes.details).toBeDefined();
    expect(schema.nodes.table).toBeDefined();
  });

  it("keeps the shared schema entrypoint free of client and React imports", () => {
    const forbidden = [
      /@\/client/,
      /@tiptap\/react/,
      /from\s+["']react["']/,
      /\.css["']/,
      /\bwindow\./,
      /\bdocument\./,
      /\bHTMLElement\b/,
      /\bNodeView\b/,
    ];

    for (const file of listSourceFiles(SHARED_EDITOR_SCHEMA_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("exports the document metric helpers used by the editor", () => {
    expect(countWords(" one  two\nthree ")).toBe(3);
    expect(countCharacters("a😀")).toBe(2);
  });
});
