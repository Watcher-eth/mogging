import { expect, test } from "bun:test";
import sharp from "sharp";
import { enrichFaceLandmarks } from "@/lib/creator/mobile-overlay-engine/enrich-landmarks";
import type { FaceLandmarksPayload } from "@/lib/creator/mobile-overlay-engine/landmarks";
import { processingOverlayPresets } from "./scan-presets";
import { reportOverlayPresets } from "@/lib/creator/mobile-overlay-engine/report-presets";
import { getImageTransform } from "@/lib/creator/mobile-overlay-engine/layout";
import { resolveOverlayPreset } from "@/lib/creator/mobile-overlay-engine/resolve";
import portrait from "./primer-portrait.json";
import { previewPortrait, resolvePreviewOverlay } from "./overlay";

test("the cached calibration matches the website report portrait dimensions", async () => {
  const image = await sharp(`public${previewPortrait.src}`).metadata();
  expect(portrait.image).toEqual({ width: image.width, height: image.height });
  expect(portrait.quality.warnings).toEqual([]);
});

test("centered cover cropping keeps scan and report measurements aligned with the portrait", () => {
  const landmarks = enrichFaceLandmarks(portrait as FaceLandmarksPayload)!;
  const fullTransform = getImageTransform(portrait.image, { width: 390, height: 560 }, "cover");
  const compactTransform = getImageTransform(portrait.image, { width: 390, height: 350 }, "cover");
  const scale = compactTransform.scale / fullTransform.scale;
  for (const preset of [
    ...processingOverlayPresets,
    reportOverlayPresets.overall,
  ]) {
    const full = resolveOverlayPreset({
      preset,
      landmarks,
      viewport: { width: 390, height: 560 },
      fit: "cover",
    }).primitives;
    const compact = resolveOverlayPreset({
      preset,
      landmarks,
      viewport: { width: 390, height: 350 },
      fit: "cover",
    }).primitives;
    for (const primitive of compact) {
      const original = full.find((item) => item.id === primitive.id)!;
      if (primitive.kind === "point" && original.kind === "point") {
        // Overlay points follow the same centered cover transform as the photo.
        expect(primitive.point.x).toBeCloseTo(compactTransform.offsetX + (original.point.x - fullTransform.offsetX) * scale, 6);
        expect(primitive.point.y).toBeCloseTo(compactTransform.offsetY + (original.point.y - fullTransform.offsetY) * scale, 6);
        expect(Number.isFinite(primitive.point.x + primitive.point.y)).toBe(
          true,
        );
      }
    }
    expect(compact.length).toBeGreaterThan(0);
  }
});

test("scan primitives resolve in the card viewport without changing their stroke sizes", () => {
  const width = (390 - 36) * 0.76;
  const scale = width / 390;
  for (const preset of processingOverlayPresets) {
    const full = resolvePreviewOverlay(preset, 390 / 0.68);
    const card = resolvePreviewOverlay(preset, width / 0.68, width);
    expect(card.length).toBe(full.length);
    for (const primitive of card) {
      const original = full.find((item) => item.id === primitive.id)!;
      if (
        (primitive.kind === "point" || primitive.kind === "label") &&
        (original.kind === "point" || original.kind === "label")
      ) {
        expect(primitive.point.x).toBeCloseTo(original.point.x * scale, 6);
        expect(primitive.point.y).toBeCloseTo(original.point.y * scale, 6);
      }
      if (primitive.kind === "line" && original.kind === "line") {
        expect(primitive.strokeWidth).toBe(original.strokeWidth);
        expect(primitive.fromPoint.x).toBeCloseTo(
          original.fromPoint.x * scale,
          6,
        );
        expect(primitive.toPoint.y).toBeCloseTo(original.toPoint.y * scale, 6);
      }
    }
  }
});
