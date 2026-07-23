import type { NormalizedPoint } from "./landmarks";

export type Size = {
  width: number;
  height: number;
};

export type ImageFit = "cover" | "contain";

export type ImageTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
};

export function getImageTransform(image: Size, viewport: Size, fit: ImageFit): ImageTransform {
  const scale = fit === "cover"
    ? Math.max(viewport.width / image.width, viewport.height / image.height)
    : Math.min(viewport.width / image.width, viewport.height / image.height);

  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;

  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (viewport.width - renderedWidth) / 2,
    offsetY: (viewport.height - renderedHeight) / 2,
  };
}

export function projectImagePoint(point: NormalizedPoint, image: Size, transform: ImageTransform) {
  return {
    x: transform.offsetX + point.x * image.width * transform.scale,
    y: transform.offsetY + point.y * image.height * transform.scale,
  };
}

export function normalizeImageSize(size: Partial<Size> | undefined, fallback: Size): Size {
  if (!size?.width || !size?.height) return fallback;
  return size as Size;
}
