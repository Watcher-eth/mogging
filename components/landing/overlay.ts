import { enrichFaceLandmarks } from "@/lib/creator/mobile-overlay-engine/enrich-landmarks";
import type { FaceLandmarksPayload } from "@/lib/creator/mobile-overlay-engine/landmarks";
import { resolveOverlayPreset } from "@/lib/creator/mobile-overlay-engine/resolve";
import type { OverlayPreset, OverlayPointRef, OverlayPrimitive } from "@/lib/creator/mobile-overlay-engine/schema";
import portrait from "./primer-portrait.json";

export const previewPortrait = { src: "/landing/report-city-portrait.webp", ...portrait.image };

export const previewLandmarks = enrichFaceLandmarks(
  portrait as FaceLandmarksPayload,
)!;
export function resolvePreviewOverlay(
  preset: OverlayPreset,
  height: number,
  width = 390,
) {
  return resolveOverlayPreset({
    preset,
    landmarks: previewLandmarks,
    viewport: { width, height },
    fit: "cover",
  }).primitives;
}

// Keep the desktop teaser on the mobile Overall sequence and timing.
const overallTrace = (contour: 'leftBrow' | 'rightBrow' | 'noseBridge' | 'jawline', delay: number, markers = true): OverlayPrimitive => ({
  id: contour, kind: 'polyline', dotted: true, markers, strokeWidth: 1, opacity: .86,
  points: Array.from({ length: previewLandmarks.contours?.[contour]?.length ?? 0 }, (_, index) => ({ contour, index })),
  animation: { delay, duration: 850, entrance: 'draw' },
})
const overallAnchor = (anchor: Extract<OverlayPointRef, { anchor: string }>['anchor'], y = 0): OverlayPointRef => ({ anchor, offset: { x: 0, y } })
const overallGuide = (id: string, from: OverlayPointRef, to: OverlayPointRef, delay: number, dashed = false): OverlayPrimitive => ({
  id, kind: 'line', from, to, dashed, strokeWidth: .6, opacity: .54,
  animation: { delay, duration: 700, entrance: 'draw' },
})
export const mobileOverallPreview: OverlayPreset = {
  id: 'mobile-overall-preview', footer: '[ OVERALL ]', primitives: [
    overallTrace('leftBrow', 0), overallTrace('rightBrow', 100),
    overallTrace('noseBridge', 180, false), overallTrace('jawline', 100),
    overallGuide('center-axis', overallAnchor('forehead'), overallAnchor('chin'), 120, true),
    overallGuide('eye-span', overallAnchor('leftEyeOuter', -.02), overallAnchor('rightEyeOuter', -.02), 200),
    overallGuide('mouth-span', overallAnchor('mouthLeft', -.015), overallAnchor('mouthRight', -.015), 300),
    overallGuide('jaw-span', overallAnchor('jawLeft'), overallAnchor('jawRight'), 400, true),
  ],
}
