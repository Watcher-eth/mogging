import { isFaceLandmarksUsable, type FaceLandmarksPayload, type NormalizedPoint } from "./landmarks";

// Decorative samples anchored to the detected outline, not additional measured landmarks.
export function buildFaceMapPoints(landmarks: FaceLandmarksPayload | null): NormalizedPoint[] {
  if (!isFaceLandmarksUsable(landmarks, 0.2)) return [];
  const detectedOutline = landmarks?.contours?.faceOutline;
  if (!detectedOutline || detectedOutline.length < 3 || detectedOutline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [];
  const outline = roundForehead(detectedOutline, landmarks!);
  const center = landmarks?.anchors.noseTip;
  if (!center) return [];
  const lengths = outline.map((point, i) => {
    const next = outline[(i + 1) % outline.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  if (perimeter <= 0) return [];
  const points: NormalizedPoint[] = [];
  for (let ring = 1; ring <= 12; ring++) {
    const radius = ring / 12;
    const count = Math.max(8, Math.round(56 * radius));
    for (let i = 0; i < count; i++) {
      let distance = ((i + (ring % 2) * 0.5) / count) * perimeter;
      let edge = 0;
      while (edge < lengths.length - 1 && distance > lengths[edge]) distance -= lengths[edge++];
      const t = lengths[edge] > 0 ? distance / lengths[edge] : 0;
      const a = outline[edge];
      const b = outline[(edge + 1) % outline.length];
      points.push({ x: center.x + (a.x + (b.x - a.x) * t - center.x) * radius, y: center.y + (a.y + (b.y - a.y) * t - center.y) * radius });
    }
  }
  for (const name of ["leftEye", "rightEye", "leftBrow", "rightBrow", "noseBridge", "noseBase", "mouth"] as const) {
    points.push(...(landmarks?.contours?.[name] ?? []));
  }
  const candidates = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  // Spread a fixed budget across the face rather than stacking dense contour samples.
  const selected: NormalizedPoint[] = [];
  const distances = candidates.map(() => Infinity);
  const aspect = landmarks!.image.height / landmarks!.image.width;
  let next = 0;
  while (selected.length < 160 && selected.length < candidates.length) {
    const point = candidates[next];
    selected.push(point);
    let farthest = -1;
    for (let i = 0; i < candidates.length; i++) {
      const dx = candidates[i].x - point.x;
      const dy = (candidates[i].y - point.y) * aspect;
      distances[i] = Math.min(distances[i], dx * dx + dy * dy);
      if (distances[i] > farthest) { farthest = distances[i]; next = i; }
    }
    if (farthest < 1e-10) break;
  }
  return selected;
}

// The detector estimates one forehead apex. Give only the decorative dot field
// a rounded cap, keeping its height and following the face's tilt.
function roundForehead(outline: NormalizedPoint[], face: FaceLandmarksPayload): NormalizedPoint[] {
  const { leftPupil: left, rightPupil: right, leftBrow, rightBrow, forehead } = face.anchors;
  if (!left || !right || !leftBrow || !rightBrow || !forehead) return outline;
  const { width, height } = face.image;
  const dx = (right.x - left.x) * width, dy = (right.y - left.y) * height;
  const length = Math.hypot(dx, dy);
  if (!length) return outline;
  const ux = dx / length, uy = dy / length;
  const local = (p: NormalizedPoint) => ({ x: p.x * width * ux + p.y * height * uy, y: -p.x * width * uy + p.y * height * ux });
  const points = outline.map(local);
  const baseline = (local(leftBrow).y + local(rightBrow).y) / 2;
  const capHeight = baseline - Math.min(local(forehead).y, ...points.map(p => p.y));
  if (capHeight <= 0) return outline;
  const lower: NormalizedPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.y >= baseline) lower.push(a);
    if ((a.y < baseline) !== (b.y < baseline)) {
      lower.push({ x: a.x + (b.x - a.x) * (baseline - a.y) / (b.y - a.y), y: baseline });
    }
  }
  const rounded: NormalizedPoint[] = [];
  for (let i = 0; i < lower.length; i++) {
    const a = lower[i], b = lower[(i + 1) % lower.length];
    rounded.push(a);
    if (Math.abs(a.y - baseline) < 0.001 && Math.abs(b.y - baseline) < 0.001) {
      for (let j = 1; j < 16; j++) {
        const angle = Math.PI * j / 16;
        rounded.push({ x: (a.x + b.x) / 2 + (a.x - b.x) / 2 * Math.cos(angle), y: baseline - capHeight * Math.sin(angle) });
      }
    }
  }
  return rounded.map(p => ({ x: (p.x * ux - p.y * uy) / width, y: (p.x * uy + p.y * ux) / height }));
}
