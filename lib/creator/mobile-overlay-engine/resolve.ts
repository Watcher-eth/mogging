import type { FaceLandmarksPayload, NormalizedPoint } from "./landmarks";
import { getImageTransform, normalizeImageSize, projectImagePoint, type ImageFit, type Size } from "./layout";
import type { OverlayPointRef, OverlayPreset, OverlayPrimitive } from "./schema";

export type PixelPoint = {
  x: number;
  y: number;
};

export type ResolvedPrimitive =
  | Extract<OverlayPrimitive, { kind: "label" }> & { point: PixelPoint }
  | Extract<OverlayPrimitive, { kind: "point" }> & { point: PixelPoint }
  | Extract<OverlayPrimitive, { kind: "line" }> & { fromPoint: PixelPoint; toPoint: PixelPoint }
  | Extract<OverlayPrimitive, { kind: "box" }> & { rect: { x: number; y: number; width: number; height: number } }
  | Extract<OverlayPrimitive, { kind: "region" }> & { pixelPoints: PixelPoint[] }
  | Extract<OverlayPrimitive, { kind: "polyline" }> & { pixelPoints: PixelPoint[] };

export type ResolvedOverlay = {
  id: string;
  footer: string;
  primitives: ResolvedPrimitive[];
};

export function resolveOverlayPreset({
  preset,
  landmarks,
  viewport,
  imageSize,
  fit = "cover",
}: {
  preset: OverlayPreset;
  landmarks: FaceLandmarksPayload | null;
  viewport: Size;
  imageSize?: Size;
  fit?: ImageFit;
}): ResolvedOverlay {
  const sourceImageSize = normalizeImageSize(imageSize ?? landmarks?.image, viewport);
  const transform = getImageTransform(sourceImageSize, viewport, fit);

  return {
    id: preset.id,
    footer: preset.footer,
    primitives: preset.primitives.flatMap((primitive) => {
      const resolved = resolvePrimitive(primitive, landmarks, sourceImageSize, transform);
      return resolved ? [resolved] : [];
    }),
  };
}

function resolvePrimitive(
  primitive: OverlayPrimitive,
  landmarks: FaceLandmarksPayload | null,
  imageSize: Size,
  transform: ReturnType<typeof getImageTransform>,
): ResolvedPrimitive | null {
  if (primitive.kind === "point" || primitive.kind === "label") {
    const point = resolvePoint(primitive.at, landmarks, imageSize, transform);
    return point ? { ...primitive, point } as ResolvedPrimitive : null;
  }

  if (primitive.kind === "line") {
    const fromPoint = resolvePoint(primitive.from, landmarks, imageSize, transform);
    const toPoint = resolvePoint(primitive.to, landmarks, imageSize, transform);
    return fromPoint && toPoint ? { ...primitive, fromPoint, toPoint } : null;
  }

  if (primitive.kind === "box") {
    const boxPoints = primitive.points?.length
      ? primitive.points
          .map((point) => resolvePoint(point, landmarks, imageSize, transform))
          .filter((point): point is PixelPoint => Boolean(point))
      : [];
    const fromPoint = resolvePoint(primitive.from, landmarks, imageSize, transform);
    const toPoint = resolvePoint(primitive.to, landmarks, imageSize, transform);
    const resolvedBoxPoints = boxPoints.length ? boxPoints : fromPoint && toPoint ? [fromPoint, toPoint] : [];
    if (resolvedBoxPoints.length < 2) return null;

    const padding = primitive.padding ?? { x: 0.035, y: 0.035 };
    const paddingX = padding.x * imageSize.width * transform.scale;
    const paddingY = padding.y * imageSize.height * transform.scale;
    const minX = Math.min(...resolvedBoxPoints.map((point) => point.x));
    const maxX = Math.max(...resolvedBoxPoints.map((point) => point.x));
    const minY = Math.min(...resolvedBoxPoints.map((point) => point.y));
    const maxY = Math.max(...resolvedBoxPoints.map((point) => point.y));
    const x = minX - paddingX;
    const y = minY - paddingY;
    const width = maxX - minX + paddingX * 2;
    const height = maxY - minY + paddingY * 2;

    return { ...primitive, rect: { x, y, width, height } };
  }

  const pixelPoints = primitive.points
    .map((point) => resolvePoint(point, landmarks, imageSize, transform))
    .filter((point): point is PixelPoint => Boolean(point));

  if (pixelPoints.length < 2) return null;
  return { ...primitive, pixelPoints };
}

function resolvePoint(
  ref: OverlayPointRef,
  landmarks: FaceLandmarksPayload | null,
  imageSize: Size,
  transform: ReturnType<typeof getImageTransform>,
): PixelPoint | null {
  const normalized = getNormalizedPoint(ref, landmarks);
  if (!normalized) return null;

  return projectImagePoint(normalized, imageSize, transform);
}

function getNormalizedPoint(ref: OverlayPointRef, landmarks: FaceLandmarksPayload | null): NormalizedPoint | null {
  const base = "anchor" in ref
    ? landmarks?.anchors[ref.anchor] ?? ref.fallback
    : "contour" in ref
      ? landmarks?.contours?.[ref.contour]?.[ref.index] ?? ref.fallback
      : ref.point;
  if (!base) return null;

  const offset = ref.offset ?? { x: 0, y: 0 };
  return {
    x: base.x + offset.x,
    y: base.y + offset.y,
  };
}
