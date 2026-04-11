export const CODE_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["plaintext", "txt"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  python: { name: "Python", aliases: ["py"] },
  java: { name: "Java" },
  csharp: { name: "C#", aliases: ["cs", "c#"] },
  cpp: { name: "C++", aliases: ["cxx", "cc", "hpp"] },
  c: { name: "C", aliases: ["h"] },
  go: { name: "Go" },
  sql: { name: "SQL" },
  php: { name: "PHP" },
  rust: { name: "Rust", aliases: ["rs"] },
  hcl: { name: "HCL", aliases: ["tf", "terraform"] },
  shell: { name: "Shell", aliases: ["sh", "bash", "shell", "zsh"] },
  dockerfile: { name: "Dockerfile", aliases: ["docker"] },
  yaml: { name: "YAML", aliases: ["yml"] },
  json: { name: "JSON" },
  jsonc: { name: "JSONC" },
  toml: { name: "TOML" },
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
