import { useEffect, useRef, useState } from "react";
import {
  ImageElement,
  ImageErrorState,
  ImageFigureFrame,
  ImageLoadingSkeleton,
  resolveImageFrameStyle,
} from "@/shared/editor/presentation/image";
import type { SitesImageProps } from "@/shared/sites/island-schemas";

export function SitesImage({ bid, src, alt, title, align, width, naturalWidth, naturalHeight }: SitesImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  const isLoading = !loaded && !errored;
  const frameStyle = resolveImageFrameStyle({ width, naturalWidth, naturalHeight });
  const sizedStyle = width && width > 0 ? { width: `${width}px` } : undefined;
  const containerStyle = isLoading || errored ? frameStyle : sizedStyle;
  const containerClassName = [isLoading ? "is-loading" : "", errored ? "is-errored" : ""].filter(Boolean).join(" ");

  return (
    <ImageFigureFrame
      bid={bid}
      align={align}
      containerClassName={containerClassName}
      containerStyle={containerStyle}
      caption={!isLoading && !errored ? alt : null}
    >
      {!errored ? (
        <ImageElement
          ref={imgRef}
          src={src}
          alt={alt ?? undefined}
          title={title ?? undefined}
          style={width && width > 0 && !isLoading ? { width: "100%" } : undefined}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      ) : null}
      {isLoading ? <ImageLoadingSkeleton /> : null}
      {errored ? <ImageErrorState /> : null}
    </ImageFigureFrame>
  );
}
