import { forwardRef } from "react";
import type { CSSProperties, ImgHTMLAttributes, ReactNode } from "react";
import { normalizeImageAlign } from "@/shared/editor/schema/image-model";
import { bidAttribute, type BlockIdentityProps } from "./attrs";

export const IMAGE_FRAME_FALLBACK_ASPECT_RATIO = 16 / 9;

export interface ImagePresentationProps extends BlockIdentityProps {
  src?: string | null;
  alt?: string | null;
  title?: string | null;
  align?: unknown;
  width?: number | null;
}

export const ImageElement = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  function ImageElement(props, ref) {
    return <img {...props} className={["tiptap-image", props.className].filter(Boolean).join(" ")} ref={ref} />;
  },
);

export function resolveImageAlignClass(align: unknown): string {
  const normalized = normalizeImageAlign(align);
  return normalized === "center"
    ? "tiptap-image-node--align-center"
    : normalized === "right"
      ? "tiptap-image-node--align-right"
      : "tiptap-image-node--align-left";
}

export interface ImageFrameStyleInput {
  width?: number | null;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
}

export function resolveImageFrameStyle({ width, naturalWidth, naturalHeight }: ImageFrameStyleInput): CSSProperties {
  const aspectRatio =
    naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : IMAGE_FRAME_FALLBACK_ASPECT_RATIO;
  const frameWidth = width && width > 0 ? width : naturalWidth && naturalWidth > 0 ? naturalWidth : null;
  return {
    aspectRatio: String(aspectRatio),
    width: frameWidth !== null ? `${frameWidth}px` : "100%",
  };
}

export interface ImageFigureFrameProps extends BlockIdentityProps {
  align?: unknown;
  containerClassName?: string;
  containerStyle?: CSSProperties;
  caption?: ReactNode;
  children: ReactNode;
}

export function ImageFigureFrame({
  bid,
  align,
  containerClassName,
  containerStyle,
  caption,
  children,
}: ImageFigureFrameProps) {
  const alignClass = resolveImageAlignClass(align);
  const containerClass = ["tiptap-image-container", containerClassName].filter(Boolean).join(" ");
  return (
    <figure className={`tiptap-image-node ${alignClass}`} {...bidAttribute(bid)}>
      <span className={containerClass} style={containerStyle}>
        {children}
        {caption ? <figcaption className="tiptap-image-alt">{caption}</figcaption> : null}
      </span>
    </figure>
  );
}

export function ImagePresentation({ bid, src, alt, title, align, width }: ImagePresentationProps) {
  if (!src) return null;

  const containerStyle: CSSProperties | undefined = width && width > 0 ? { width: `${width}px` } : undefined;
  const imageStyle: CSSProperties | undefined = width && width > 0 ? { width: "100%" } : undefined;

  return (
    <ImageFigureFrame bid={bid} align={align} containerStyle={containerStyle} caption={alt}>
      <ImageElement src={src} alt={alt ?? undefined} title={title ?? undefined} style={imageStyle} />
    </ImageFigureFrame>
  );
}
