import type { FaceAnchorKey } from './mobile-overlay-engine/landmarks'
import type { OverlayPointRef, OverlayPreset, OverlayPrimitive } from './mobile-overlay-engine/schema'
import { CONTOUR_SAMPLES } from './welcome-overlay-landmarks'

// Match the four report presets used by the native welcome portrait.
const anchor = (key: FaceAnchorKey, x = 0, y = 0): OverlayPointRef => ({ anchor: key, offset: { x: x / 100, y: y / 100 } });
const timing = (delay: number, duration = 850) => ({ delay, duration, entrance: "draw" as const });
const trace = (key: keyof typeof CONTOUR_SAMPLES, delay = 0, closed = false, markers = true): OverlayPrimitive => ({
  id: `${key}-contour`, kind: "polyline",
  points: Array.from({ length: CONTOUR_SAMPLES[key] }, (_, index) => ({ contour: key, index })),
  closed, dotted: true, markers, strokeWidth: 1, opacity: 0.86,
  animation: timing(delay),
});
const guide = (id: string, from: OverlayPointRef, to: OverlayPointRef, delay = 140, dashed = false): OverlayPrimitive => ({
  id, kind: "line", from, to, dashed, strokeWidth: 0.6, opacity: 0.54,
  animation: timing(delay, 700),
});
const preset = (id: string, primitives: OverlayPrimitive[]): OverlayPreset => ({
  id: `report-${id}`, footer: `[ ${id.toUpperCase()} ]`, primitives,
});
const jaw = () => trace("jawline", 100);
const eyes = () => [trace("leftEye", 0, true), trace("rightEye", 100, true)];
const center = () => guide("center-axis", anchor("forehead"), anchor("chin"), 120, true);
const pairedGuides = (): OverlayPrimitive[] => [
  guide("eye-span", anchor("leftEyeOuter", 0, -2), anchor("rightEyeOuter", 0, -2), 200),
  guide("mouth-span", anchor("mouthLeft", 0, -1.5), anchor("mouthRight", 0, -1.5), 300),
  guide("jaw-span", anchor("jawLeft"), anchor("jawRight"), 400, true),
];

export const welcomeOverlayPresets = {
  eyes: preset('eyes', eyes()),
  mouth: preset('mouth', [trace('mouth', 0, true)]),
  jaw: preset('jaw', [jaw()]),
  symmetry: preset('symmetry', [...eyes(), trace('mouth', 200, true, false), trace('jawline', 300, false, false), center(), ...pairedGuides()]),
}
