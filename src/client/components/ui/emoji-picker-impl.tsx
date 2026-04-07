import type { CSSProperties } from "react";
import EmojiPickerReact, { Theme, EmojiStyle } from "emoji-picker-react";
import "@/client/styles/emoji-picker.css";

interface EmojiPickerImplProps {
  onSelect: (emoji: string) => void;
  className?: string;
  style?: CSSProperties;
}

export function EmojiPickerImpl({ onSelect, className, style }: EmojiPickerImplProps) {
  return (
    <EmojiPickerReact
      className={["bland-emoji-picker", className].filter(Boolean).join(" ")}
      style={style}
      theme={Theme.DARK}
      emojiStyle={EmojiStyle.APPLE}
      onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
      searchPlaceholder="Search emoji..."
      width={320}
      height={400}
      previewConfig={{ showPreview: false }}
    />
  );
}
