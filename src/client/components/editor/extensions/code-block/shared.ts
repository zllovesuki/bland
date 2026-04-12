// Keep Plain Text first and the remaining languages sorted A-Z by display name.
export const CODE_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["plaintext", "txt"] },
  c: { name: "C", aliases: ["h"] },
  csharp: { name: "C#", aliases: ["cs", "c#"] },
  cpp: { name: "C++", aliases: ["cxx", "cc", "hpp"] },
  dockerfile: { name: "Dockerfile", aliases: ["docker"] },
  go: { name: "Go" },
  hcl: { name: "HCL", aliases: ["tf", "terraform"] },
  java: { name: "Java" },
  javascript: { name: "JavaScript", aliases: ["js"] },
  json: { name: "JSON" },
  jsonc: { name: "JSONC" },
  markdown: { name: "Markdown", aliases: ["md"] },
  php: { name: "PHP" },
  python: { name: "Python", aliases: ["py"] },
  rust: { name: "Rust", aliases: ["rs"] },
  shell: { name: "Shell", aliases: ["sh", "bash", "shell", "zsh"] },
  sql: { name: "SQL" },
  toml: { name: "TOML" },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  yaml: { name: "YAML", aliases: ["yml"] },
};

const ALIAS_TO_LANG: Record<string, string> = {};
for (const [id, meta] of Object.entries(CODE_LANGUAGES)) {
  ALIAS_TO_LANG[id] = id;
  for (const alias of meta.aliases ?? []) {
    ALIAS_TO_LANG[alias] = id;
  }
}

export function resolveLanguage(raw: string | undefined | null): string {
  if (!raw) return "text";
  return ALIAS_TO_LANG[raw.trim().toLowerCase()] ?? "text";
}
