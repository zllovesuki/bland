import { useEffect, useRef, useCallback } from "react";

interface EditorTitleProps {
  title: string;
  onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  readOnly?: boolean;
}

export function EditorTitle({ title, onInput, disabled, readOnly }: EditorTitleProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const autoSize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(autoSize, [title, autoSize]);

  return (
    <textarea
      ref={ref}
      value={title}
      onChange={onInput}
      disabled={disabled}
      readOnly={readOnly}
      placeholder="Untitled"
      rows={1}
      className="w-full resize-none overflow-hidden rounded-md border-none bg-transparent pl-4 font-display text-3xl font-bold tracking-[-0.03em] text-zinc-100 placeholder-zinc-500 outline-none focus-visible:bg-zinc-800/40 disabled:opacity-50 read-only:cursor-default sm:pl-7 sm:text-4xl"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
    />
  );
}
