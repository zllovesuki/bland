import { useEffect, useState } from "react";
import { getEmojiAssetUrlSync, loadEmojiAssetUrl, normalizeEmoji } from "@/client/lib/emoji";

interface EmojiIconProps {
  emoji: string;
  size?: number;
}

export function EmojiIcon({ emoji, size = 20 }: EmojiIconProps) {
  const cachedAssetUrl = getEmojiAssetUrlSync(emoji);
  const [assetState, setAssetState] = useState(() => ({
    emoji,
    assetUrl: cachedAssetUrl,
    failed: false,
  }));
  const currentAsset = assetState.emoji === emoji ? assetState : { emoji, assetUrl: cachedAssetUrl, failed: false };
  const style = { width: size, height: size };

  useEffect(() => {
    if (currentAsset.assetUrl !== null) return;
    let cancelled = false;
    loadEmojiAssetUrl(emoji).then((url) => {
      if (!cancelled) setAssetState({ emoji, assetUrl: url, failed: false });
    });
    return () => {
      cancelled = true;
    };
  }, [currentAsset.assetUrl, emoji]);

  if (currentAsset.assetUrl && !currentAsset.failed) {
    return (
      <img
        src={currentAsset.assetUrl}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        onError={() => setAssetState({ emoji, assetUrl: currentAsset.assetUrl, failed: true })}
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
