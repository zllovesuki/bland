import { useEffect, useState } from "react";
import { getEmojiAssetUrl, normalizeEmoji } from "@/client/lib/emoji";

interface EmojiIconProps {
  emoji: string;
  size?: number;
}

export function EmojiIcon({ emoji, size = 20 }: EmojiIconProps) {
  const assetUrl = getEmojiAssetUrl(emoji);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  useEffect(() => {
    setFailed(false);
  }, [assetUrl]);

  if (assetUrl && !failed) {
    return (
      <img
        src={assetUrl}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        onError={() => setFailed(true)}
        className="inline-block shrink-0 select-none align-text-bottom"
        style={style}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={normalizeEmoji(emoji)}
      className="inline-flex shrink-0 select-none items-center justify-center align-text-bottom leading-none"
      style={{ ...style, fontSize: size }}
    >
      {normalizeEmoji(emoji)}
    </span>
  );
}
