import type { FaceContourKey, FaceLandmarkContours, FaceLandmarksPayload, NormalizedPoint } from "./landmarks";

const CONTOUR_SAMPLES: Record<FaceContourKey, number> = {
  faceOutline: 15, leftEye: 16, rightEye: 16, leftBrow: 5, rightBrow: 5,
  noseBridge: 3, noseBase: 7, mouth: 20, jawline: 13, cheekbones: 5,
};
const CLOSED_CONTOURS = new Set<FaceContourKey>(["faceOutline", "leftEye", "rightEye", "mouth"]);
const validPoint = (point: NormalizedPoint) => Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;

// Normalize the representation, never reshape a detected face to ideal proportions.
export function enrichFaceLandmarks(landmarks: FaceLandmarksPayload | null): FaceLandmarksPayload | null {
  if (!landmarks) return null;
  const anchors = Object.fromEntries(Object.entries(landmarks.anchors).filter(([, point]) => point && validPoint(point)));
  if (!anchors.mouthCenter && anchors.mouthLeft && anchors.mouthRight) {
    anchors.mouthCenter = { x: (anchors.mouthLeft.x + anchors.mouthRight.x) / 2, y: (anchors.mouthLeft.y + anchors.mouthRight.y) / 2 };
  }
  const contours: FaceLandmarkContours = {};
  for (const key of Object.keys(CONTOUR_SAMPLES) as FaceContourKey[]) {
    const points = landmarks.contours?.[key];
    // A partial/broken contour should disappear, not connect across missing data.
    if (!points || points.length < 2 || !points.every(validPoint)) continue;
    contours[key] = resampleContour(points, CONTOUR_SAMPLES[key], CLOSED_CONTOURS.has(key), landmarks.image);
  }
  return { ...landmarks, anchors, contours };
}

function resampleContour(points: NormalizedPoint[], count: number, closed: boolean, image: { width: number; height: number }) {
  if (points.length === count) return points;
  const sameEnds = Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 0.00001;
  const source = closed && !sameEnds ? [...points, points[0]] : points;
  const lengths = source.slice(1).map((point, i) => Math.hypot((point.x - source[i].x) * image.width, (point.y - source[i].y) * image.height));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return Array.from({ length: count }, (_, i) => {
    let distance = total * i / (count - 1);
    let edge = 0;
    while (edge < lengths.length - 1 && distance > lengths[edge]) distance -= lengths[edge++];
    const t = lengths[edge] ? distance / lengths[edge] : 0;
    const a = source[edge], b = source[edge + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}
