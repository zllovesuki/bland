import type { ReactNode } from "react";
import { CODE_LANGUAGES, resolveLanguage } from "@/shared/editor/schema/code-block-model";
import { bidAttribute, type BlockIdentityProps } from "./attrs";

export interface CodeBlockFrameProps extends BlockIdentityProps {
  language: unknown;
  controls?: ReactNode;
  children?: ReactNode;
}

export function getCodeLanguageLabel(language: unknown): string {
  const normalizedLanguage = resolveLanguage(typeof language === "string" ? language : null);
  return CODE_LANGUAGES[normalizedLanguage]?.name ?? CODE_LANGUAGES.text.name;
}

export function CodeBlockFrame({ bid, language, controls, children }: CodeBlockFrameProps) {
  return (
    <div
      className="tiptap-code-block-wrapper"
      data-language={resolveLanguage(asOptionalString(language))}
      {...bidAttribute(bid)}
    >
      {controls}
      <pre className="tiptap-code-block-pre" spellCheck={false}>
        {children}
      </pre>
    </div>
  );
}

export function CodeBlockContent({ children }: { children?: ReactNode }) {
  return (
    <code className="tiptap-code-block-content" style={{ whiteSpace: "inherit" }}>
      {children}
    </code>
  );
}

export function CodeBlockPresentation(props: CodeBlockFrameProps) {
  return (
    <CodeBlockFrame {...props}>
      <CodeBlockContent>{props.children}</CodeBlockContent>
    </CodeBlockFrame>
  );
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
