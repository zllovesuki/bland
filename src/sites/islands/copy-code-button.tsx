import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyTextToClipboard } from "@/lib/hooks/use-copy-feedback";

const COPY_RESET_MS = 2000;

export function CopyCodeButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    const text = readNearestCodeText(buttonRef.current);
    void copyTextToClipboard(text).then(
      () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setCopied(true);
        timerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
      },
      () => {
        // Clipboard unavailable; keep the button in its idle state.
      },
    );
  }, []);

  const label = copied ? "Code copied" : "Copy code";

  return (
    <button
      ref={buttonRef}
      type="button"
      className="tiptap-code-block-copy-btn"
      aria-label={label}
      title={label}
      data-copied={copied ? "true" : undefined}
      onClick={handleClick}
    >
      <span data-copy-icon-default="" aria-hidden="true">
        <Copy className="h-3.5 w-3.5" />
      </span>
      <span data-copy-icon-copied="" aria-hidden="true">
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function readNearestCodeText(button: HTMLButtonElement | null): string {
  if (!button) return "";
  const wrapper = button.closest(".tiptap-code-block-wrapper");
  const code = wrapper?.querySelector(".tiptap-code-block-content");
  return code?.textContent ?? "";
}
