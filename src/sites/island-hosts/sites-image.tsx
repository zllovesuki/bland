import {
  ImageElement,
  ImageFigureFrame,
  ImageLoadingSkeleton,
  resolveImageFrameStyle,
} from "@/shared/editor/presentation/image";
import type { SitesImageProps } from "@/shared/sites/island-schemas";
import { SiteIslandHost } from "./island-host";

export function SitesImageIslandHost(props: SitesImageProps) {
  const { bid, src, alt, title, align, width, naturalWidth, naturalHeight } = props;
  const frameStyle = resolveImageFrameStyle({ width, naturalWidth, naturalHeight });

  return (
    <SiteIslandHost name="sites-image" props={props}>
      <ImageFigureFrame bid={bid} align={align} containerClassName="is-loading" containerStyle={frameStyle}>
        <ImageElement src={src} alt={alt ?? undefined} title={title ?? undefined} />
        <ImageLoadingSkeleton />
      </ImageFigureFrame>
    </SiteIslandHost>
  );
}
