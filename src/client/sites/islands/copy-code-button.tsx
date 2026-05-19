import { useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "@/shared/browser/use-copy-feedback";
import { CodeBlockCopyButtonChrome, getCodeCopyButtonLabel } from "@/shared/editor/presentation/code-block";

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

  return (
    <CodeBlockCopyButtonChrome
      ref={buttonRef}
      copied={copied}
      aria-label={getCodeCopyButtonLabel(copied)}
      onClick={handleClick}
    />
  );
}

function readNearestCodeText(button: HTMLButtonElement | null): string {
  if (!button) return "";
  const wrapper = button.closest(".tiptap-code-block-wrapper");
  const code = wrapper?.querySelector(".tiptap-code-block-content");
  return code?.textContent ?? "";
}
