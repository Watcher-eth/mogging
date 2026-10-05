import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { enrichFaceLandmarks } from "@/lib/creator/mobile-overlay-engine/enrich-landmarks";
import type { FaceLandmarksPayload } from "@/lib/creator/mobile-overlay-engine/landmarks";
import { processingOverlayPresets } from "./scan-presets";
import { reportOverlayPresets } from "@/lib/creator/mobile-overlay-engine/report-presets";
import { resolveOverlayPreset } from "@/lib/creator/mobile-overlay-engine/resolve";
import portrait from "./primer-portrait.json";
import { resolvePreviewOverlay } from "./overlay";

test("the cached calibration is paired with the exact mobile portrait", () => {
  expect(
    readFileSync("public/model2.png").equals(
      readFileSync("../mogging-mobile/assets/images/model2.png"),
    ),
  ).toBe(true);
  expect(portrait).toEqual(
    JSON.parse(
      readFileSync(
        "../mogging-mobile/src/overlay-engine/detection/primer-portrait.json",
        "utf8",
      ),
    ),
  );
});

test("centered cover cropping keeps scan and report measurements aligned with the portrait", () => {
  const landmarks = enrichFaceLandmarks(portrait as FaceLandmarksPayload)!;
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
        // SVG xMidYMid slice removes 105px at each vertical edge, just like the photo.
        expect(primitive.point.x).toBeCloseTo(original.point.x, 6);
        expect(primitive.point.y).toBeCloseTo(original.point.y - 105, 6);
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
