import type { CSSProperties } from "react";
import { lazy, Suspense } from "react";

const EmojiPickerImpl = lazy(() => import("./emoji-picker-impl").then((mod) => ({ default: mod.EmojiPickerImpl })));

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function EmojiPicker({ onSelect, className, style }: EmojiPickerProps) {
  return (
    <Suspense
      fallback={<div className="h-[400px] w-[320px] rounded-lg border border-zinc-700 bg-zinc-900" style={style} />}
    >
      <EmojiPickerImpl onSelect={onSelect} className={className} style={style} />
    </Suspense>
  );
}
