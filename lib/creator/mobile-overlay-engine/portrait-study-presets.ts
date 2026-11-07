import type { FaceAnchorKey, FaceContourKey, FaceLandmarkContours } from "./landmarks";
import type { OverlayPointRef, OverlayPreset, OverlayPrimitive } from "./schema";

// Category geometry from mogging-mobile/src/overlay-engine/report-presets.ts.
export function portraitStudyPreset(category: string, contours?: FaceLandmarkContours): OverlayPreset {
  const anchor = (key: FaceAnchorKey, y = 0): OverlayPointRef => ({ anchor: key, offset: { x: 0, y: y / 100 } });
  const trace = (key: FaceContourKey, delay = 0, closed = false, markers = true): OverlayPrimitive => ({
    id: `${key}-contour`, kind: "polyline",
    points: (contours?.[key] ?? []).map((_, index) => ({ contour: key, index })),
    closed, dotted: true, markers, strokeWidth: 1, opacity: .86,
    animation: { delay, duration: 850, entrance: "draw" },
  });
  const guide = (id: string, from: OverlayPointRef, to: OverlayPointRef, delay: number, dashed = true): OverlayPrimitive => ({
    id, kind: "line", from, to, dashed, strokeWidth: .6, opacity: .54,
    animation: { delay, duration: 700, entrance: "draw" },
  });
  const jaw = () => trace("jawline", 100);
  const categories: Record<string, () => OverlayPrimitive[]> = {
    overall: () => [
      trace("leftBrow"), trace("rightBrow", 100), trace("noseBridge", 180, false, false), jaw(),
      guide("center-axis", anchor("forehead"), anchor("chin"), 120),
      guide("eye-span", anchor("leftEyeOuter", -2), anchor("rightEyeOuter", -2), 200, false),
      guide("mouth-span", anchor("mouthLeft", -1.5), anchor("mouthRight", -1.5), 300, false),
      guide("jaw-span", anchor("jawLeft"), anchor("jawRight"), 400),
    ],
    symmetry: () => [trace("leftEye", 0, true), trace("rightEye", 100, true),
      guide("center-axis", anchor("forehead"), anchor("chin"), 120)],
    proportions: () => [trace("jawline", 100, false, false),
      guide("center-axis", anchor("forehead"), anchor("chin"), 120)],
    eyes: () => [trace("leftEye", 0, true), trace("rightEye", 100, true)],
    brows: () => [trace("leftBrow"), trace("rightBrow", 100)],
    nose: () => [trace("noseBridge"), trace("noseBase", 120), guide("nose-axis", anchor("noseBridge", -1.5), anchor("noseTip", 2), 220)],
    mouth: () => [trace("mouth", 0, true)],
    jaw: () => [jaw()],
    "face-shape": () => [trace("faceOutline", 0, true, false), jaw(), guide("cheek-width", anchor("leftCheek"), anchor("rightCheek"), 220)],
  };
  return { id: `report-${category}`, footer: "", primitives: categories[category]?.() ?? [] };
}
