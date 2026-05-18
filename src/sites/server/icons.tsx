import { getEmojiAssetUrl } from "@/shared/emoji";

interface SiteIconMarkProps {
  icon: string;
  imageClassName: string;
  glyphClassName: string;
  imageSize: number;
}

export function SiteIconMark({ icon, imageClassName, glyphClassName, imageSize }: SiteIconMarkProps) {
  const assetUrl = getEmojiAssetUrl(icon);
  if (assetUrl) {
    return (
      <img
        className={imageClassName}
        src={assetUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        width={imageSize}
        height={imageSize}
      />
    );
  }
  return <span className={glyphClassName}>{icon}</span>;
}
