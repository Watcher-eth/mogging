import { enrichFaceLandmarks } from "@/lib/creator/mobile-overlay-engine/enrich-landmarks";
import type { FaceLandmarksPayload } from "@/lib/creator/mobile-overlay-engine/landmarks";
import { resolveOverlayPreset } from "@/lib/creator/mobile-overlay-engine/resolve";
import type { OverlayPreset } from "@/lib/creator/mobile-overlay-engine/schema";
import portrait from "./primer-portrait.json";

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
