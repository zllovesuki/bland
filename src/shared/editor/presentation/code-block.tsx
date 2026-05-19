import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { CODE_LANGUAGES, resolveLanguage } from "@/shared/editor/schema/code-block-model";
import { bidAttribute, type BlockIdentityProps } from "./attrs";

export interface CodeBlockFrameProps extends BlockIdentityProps {
  language: unknown;
  controls?: ReactNode;
  children?: ReactNode;
}

export interface CodeBlockCopyButtonChromeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  copied?: boolean;
}

export function getCodeLanguageLabel(language: unknown): string {
  const normalizedLanguage = resolveLanguage(typeof language === "string" ? language : null);
  return CODE_LANGUAGES[normalizedLanguage]?.name ?? CODE_LANGUAGES.text.name;
}

export function getCodeCopyButtonLabel(copied: boolean): string {
  return copied ? "Code copied" : "Copy code";
}

export const CodeBlockCopyButtonChrome = forwardRef<HTMLButtonElement, CodeBlockCopyButtonChromeProps>(
  function CodeBlockCopyButtonChrome(
    { copied = false, className, type = "button", title, "aria-label": ariaLabel, ...props },
    ref,
  ) {
    const label = typeof ariaLabel === "string" ? ariaLabel : getCodeCopyButtonLabel(copied);

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={["tiptap-code-block-copy-btn", className].filter(Boolean).join(" ")}
        aria-label={label}
        title={title ?? label}
        data-copied={copied ? "true" : undefined}
      >
        <span data-copy-icon-default="" aria-hidden="true">
          <Copy className="h-3.5 w-3.5" />
        </span>
        <span data-copy-icon-copied="" aria-hidden="true">
          <Check className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  },
);

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
