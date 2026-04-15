import { createLowlight } from "lowlight";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { CODE_LANGUAGES } from "./shared";

export const codeBlockLowlight = createLowlight({
  text: plaintext,
  plaintext,
  c,
  csharp,
  cpp,
  dockerfile,
  go,
  hcl: ini,
  java,
  javascript,
  json,
  jsonc: json,
  markdown,
  php,
  python,
  rust,
  shell,
  sql,
  toml: ini,
  typescript,
  yaml,
});

for (const [language, meta] of Object.entries(CODE_LANGUAGES)) {
  const aliases = (meta.aliases ?? []).filter((alias) => alias !== language);
  if (aliases.length > 0) {
    codeBlockLowlight.registerAlias({ [language]: aliases });
  }
}
