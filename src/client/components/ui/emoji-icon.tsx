import { useEffect, useState } from "react";
import { getEmojiAssetUrlSync, loadEmojiAssetUrl, normalizeEmoji } from "@/client/lib/emoji";

interface EmojiIconProps {
  emoji: string;
  size?: number;
}

export function EmojiIcon({ emoji, size = 20 }: EmojiIconProps) {
  const [assetUrl, setAssetUrl] = useState<string | null>(() => getEmojiAssetUrlSync(emoji));
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const cached = getEmojiAssetUrlSync(emoji);
    setAssetUrl(cached);
    if (cached === null) {
      loadEmojiAssetUrl(emoji).then((url) => {
        if (!cancelled) setAssetUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [emoji]);

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
