import type { FaceAnchorKey, FaceContourKey, NormalizedPoint } from "./landmarks";
import type { OverlayPointRef, OverlayPreset, OverlayPrimitive } from "./schema";

type AnchorRef = Extract<OverlayPointRef, { anchor: FaceAnchorKey }>;
type ContourRef = Extract<OverlayPointRef, { contour: FaceContourKey }>;

const n = (x: number, y: number): NormalizedPoint => ({ x: x / 100, y: y / 100 });
const offset = (x: number, y: number): NormalizedPoint => ({ x: x / 100, y: y / 100 });
const at = (anchor: FaceAnchorKey, x: number, y: number, delta?: NormalizedPoint): AnchorRef => ({
  anchor,
  fallback: n(x, y),
  ...(delta ? { offset: delta } : null),
});
const contour = (key: FaceContourKey, index: number, x: number, y: number, delta?: NormalizedPoint): ContourRef => ({
  contour: key,
  index,
  fallback: n(x, y),
  ...(delta ? { offset: delta } : null),
});

const common = {
  leftEyeOuter: at("leftEyeOuter", 34, 39),
  leftEyeInner: at("leftEyeInner", 46, 38),
  rightEyeInner: at("rightEyeInner", 56, 38),
  rightEyeOuter: at("rightEyeOuter", 68, 39),
  leftPupil: at("leftPupil", 40, 39),
  rightPupil: at("rightPupil", 61, 39),
  leftBrow: at("leftBrow", 34, 34),
  rightBrow: at("rightBrow", 66, 34),
  forehead: at("forehead", 50, 31),
  noseBridge: at("noseBridge", 51, 42),
  noseTip: at("noseTip", 51, 52),
  mouthLeft: at("mouthLeft", 41, 66),
  mouthRight: at("mouthRight", 62, 66),
  mouthCenter: at("mouthCenter", 51, 67),
  upperLip: at("upperLip", 51, 64),
  lowerLip: at("lowerLip", 51, 70),
  leftCheek: at("leftCheek", 36, 55),
  rightCheek: at("rightCheek", 64, 55),
  jawLeft: at("jawLeft", 33, 72),
  jawRight: at("jawRight", 68, 72),
  chin: at("chin", 50, 79),
};

const detail = {
  faceOutline: Array.from({ length: 15 }, (_value, index) => contour("faceOutline", index, 50, 50)),
  jawline: Array.from({ length: 13 }, (_value, index) => contour("jawline", index, 50, 75)),
  leftEye: Array.from({ length: 16 }, (_value, index) => contour("leftEye", index, 40, 39)),
  rightEye: Array.from({ length: 16 }, (_value, index) => contour("rightEye", index, 61, 39)),
  mouth: Array.from({ length: 20 }, (_value, index) => contour("mouth", index, 51, 67)),
  noseBridge: [0, 1, 2].map((index) => contour("noseBridge", index, 51, 47)),
  noseBase: Array.from({ length: 7 }, (_value, index) => contour("noseBase", index, 51, 54)),
  cheekLeft: contour("cheekbones", 0, 36, 55),
  cheekRight: contour("cheekbones", 4, 64, 55),
};

const timing = (delay: number, duration = 900) => ({
  delay,
  duration,
  entrance: "draw" as const,
});

const line = (id: string, from: OverlayPointRef, to: OverlayPointRef, delay: number, dashed = false): OverlayPrimitive => ({
  id,
  kind: "line",
  from,
  to,
  dashed,
  strokeWidth: 0.36,
  opacity: 0.88,
  animation: timing(delay + 260, 1120),
});

const dot = (id: string, point: OverlayPointRef, delay: number): OverlayPrimitive => ({
  id,
  kind: "point",
  at: point,
  radius: 3.2,
  tone: "dot",
  animation: { delay, duration: 360, entrance: "scale" },
});

const box = (id: string, points: OverlayPointRef[], paddingX: number, paddingY: number, delay: number, dashed = false): OverlayPrimitive => ({
  id,
  kind: "box",
  from: points[0],
  to: points[1],
  points,
  padding: offset(paddingX, paddingY),
  dashed,
  cornerOnly: true,
  cornerLength: 0.24,
  strokeWidth: 0.35,
  opacity: 0.85,
  animation: timing(delay + 260, 1040),
});

const label = (id: string, title: string, value: string, point: OverlayPointRef, delay = 900, align?: "left" | "right"): OverlayPrimitive => ({
  id,
  kind: "label",
  title,
  value,
  at: point,
  align,
  variant: "tag",
  animation: { delay, duration: 540, entrance: "slide" },
});

const polyline = (id: string, points: OverlayPointRef[], delay: number, dashed = false, closed = false): OverlayPrimitive => ({
  id,
  kind: "polyline",
  points,
  closed,
  dashed,
  strokeWidth: 0.36,
  opacity: 0.88,
  animation: timing(delay + 260, 1200),
});

const region = (id: string, points: OverlayPointRef[], delay: number, fillOpacity = 0.055): OverlayPrimitive => ({
  id,
  kind: "region",
  points,
  fillOpacity,
  strokeWidth: 0.3,
  opacity: 0.36,
  animation: timing(delay + 180, 1000),
});

const presets: Record<string, OverlayPreset> = {
  eyes: {
    id: "report-eyes",
    footer: "[ 001 ] EYES",
    primitives: [
      polyline("left-eye-contour", detail.leftEye, 40, false, true),
      polyline("right-eye-contour", detail.rightEye, 120, false, true),
      line("eye-line", common.leftEyeOuter, common.rightEyeOuter, 180),
      dot("left-eye-outer", common.leftEyeOuter, 0),
      dot("left-eye-inner", common.leftEyeInner, 70),
      dot("right-eye-inner", common.rightEyeInner, 140),
      dot("right-eye-outer", common.rightEyeOuter, 210),
      dot("left-pupil", common.leftPupil, 280),
      dot("right-pupil", common.rightPupil, 350),
      label("eyes-label", "Eyes distance", "[ measured ]", at("rightEyeInner", 56, 38, offset(4, 7))),
    ],
  },
  nose: {
    id: "report-nose",
    footer: "[ 002 ] NOSE",
    primitives: [
      box("nose-box", [...detail.noseBridge, ...detail.noseBase, common.noseTip], 2.1, 1.8, 80, true),
      polyline("nose-bridge-contour", detail.noseBridge, 140),
      polyline("nose-base-contour", detail.noseBase, 220, true),
      line("nose-axis", at("noseBridge", 51, 42, offset(0, -1.2)), at("noseTip", 51, 52, offset(0, 2.8)), 180),
      dot("bridge", common.noseBridge, 0),
      dot("tip", common.noseTip, 70),
      label("nose-label", "Nose axis", "[ centered ]", at("noseTip", 51, 52, offset(5.2, 0.4)), 900, "right"),
    ],
  },
  mouth: {
    id: "report-mouth",
    footer: "[ 003 ] MOUTH",
    primitives: [
      polyline("mouth-contour", detail.mouth, 80, false, true),
      dot("mouth-left", common.mouthLeft, 0),
      dot("mouth-center", common.mouthCenter, 70),
      dot("mouth-right", common.mouthRight, 140),
      label("mouth-label", "Lips fullness", "[ measured ]", at("mouthRight", 62, 66, offset(4.2, -0.8)), 900, "right"),
    ],
  },
  jaw: {
    id: "report-jaw",
    footer: "[ 004 ] JAW",
    primitives: [
      region("jaw-region", detail.jawline, 40, 0.07),
      line("jaw-contour-left", common.jawLeft, common.chin, 160),
      line("jaw-contour-right", common.chin, common.jawRight, 280),
      dot("jaw-left-dot", common.jawLeft, 0),
      dot("chin-dot", common.chin, 70),
      dot("jaw-right-dot", common.jawRight, 140),
      label("jaw-label", "Jaw angle", "[ measured ]", at("jawRight", 68, 72, offset(2, 0))),
    ],
  },
  dimorphism: {
    id: "report-dimorphism",
    footer: "[ 005 ] DIMORPHISM",
    primitives: [
      line("brow-line", common.leftBrow, common.rightBrow, 180, true),
      line("left-jaw-line", common.jawLeft, common.chin, 280, true),
      line("right-jaw-line", common.chin, common.jawRight, 380, true),
      line("center-line", at("noseTip", 50, 43), common.chin, 480, true),
      dot("left-brow", common.leftBrow, 0),
      dot("right-brow", common.rightBrow, 70),
      dot("jaw-left", common.jawLeft, 140),
      dot("jaw-right", common.jawRight, 210),
      dot("chin", common.chin, 280),
      dot("nose", common.noseTip, 350),
      label("dimorphism-label", "Dimorphism", "[ measured ]", at("rightBrow", 66, 34, offset(4, 8))),
    ],
  },
  "face-shape": {
    id: "report-face-shape",
    footer: "[ 006 ] FACE SHAPE",
    primitives: [
      region("face-region", detail.faceOutline, 40, 0.05),
      polyline("face-outline", detail.faceOutline, 140, true),
      line("cheekbone-width", detail.cheekLeft, detail.cheekRight, 360, true),
      polyline("jaw-shape", detail.jawline, 440),
      dot("forehead", common.forehead, 0),
      dot("jaw-left", common.jawLeft, 70),
      dot("jaw-right", common.jawRight, 140),
      dot("chin", common.chin, 210),
      dot("left-cheek", common.leftCheek, 280),
      dot("right-cheek", common.rightCheek, 350),
      label("shape-label", "Face shape", "[ measured ]", at("jawRight", 68, 72, offset(3.4, -4.8)), 900, "right"),
    ],
  },
  "facial-fat": {
    id: "report-facial-fat",
    footer: "[ 007 ] FACIAL FAT",
    primitives: [
      region("lower-face-region", [...detail.jawline, detail.cheekRight, detail.cheekLeft], 40, 0.06),
      box("facial-fat-box", [detail.cheekLeft, detail.cheekRight, common.jawLeft, common.jawRight], 6, 5, 80),
      line("left-cheek-jaw", detail.cheekLeft, common.jawLeft, 180),
      line("right-cheek-jaw", detail.cheekRight, common.jawRight, 280),
      polyline("jaw-softness", detail.jawline, 380, true),
      dot("left-cheek", common.leftCheek, 0),
      dot("right-cheek", common.rightCheek, 70),
      dot("jaw-left", common.jawLeft, 140),
      dot("jaw-right", common.jawRight, 210),
      dot("chin", common.chin, 280),
      label("fat-label", "Soft tissue", "[ estimated ]", at("rightCheek", 64, 55, offset(5, 6))),
    ],
  },
  "biological-age": {
    id: "report-biological-age",
    footer: "[ 008 ] BIOLOGICAL AGE",
    primitives: [
      box("age-eye-box", [...detail.leftEye, ...detail.rightEye], 3, 2.5, 80),
      line("eye-texture", common.leftEyeInner, common.rightEyeInner, 180),
      line("nose-mouth", common.noseTip, common.mouthCenter, 280),
      line("mouth-chin", common.mouthCenter, common.chin, 380),
      dot("left-eye", common.leftEyeInner, 0),
      dot("right-eye", common.rightEyeInner, 70),
      dot("nose", common.noseTip, 140),
      dot("mouth", common.mouthCenter, 210),
      dot("chin", common.chin, 280),
      label("age-label", "Skin Age", "[ measured ]", at("rightEyeInner", 62, 46, offset(6, 8))),
    ],
  },
  symmetry: {
    id: "report-symmetry",
    footer: "[ 009 ] SYMMETRY",
    primitives: [
      region("symmetry-region", detail.faceOutline, 40, 0.045),
      line("vertical-axis", common.forehead, common.chin, 180),
      line("eye-axis", at("leftPupil", 40, 39, offset(-4.2, 0)), at("rightPupil", 61, 39, offset(4.2, 0)), 280),
      line("mouth-axis", at("mouthLeft", 41, 66, offset(-3.2, 0)), at("mouthRight", 62, 66, offset(3.2, 0)), 380),
      dot("forehead", common.forehead, 0),
      dot("nose", common.noseTip, 70),
      dot("chin", common.chin, 140),
      dot("left-eye", common.leftPupil, 210),
      dot("right-eye", common.rightPupil, 280),
      dot("mouth", common.mouthCenter, 350),
      label("symmetry-label", "Symmetry", "[ measured ]", at("noseTip", 50, 44, offset(7, 0))),
    ],
  },
  overall: {
    id: "report-overall",
    footer: "[ 010 ] OVERALL",
    primitives: [
      region("face-region", detail.faceOutline, 40, 0.05),
      polyline("face-outline", detail.faceOutline, 160, true),
      line("center-axis", common.forehead, common.chin, 380),
      line("eye-line", common.leftEyeOuter, common.rightEyeOuter, 480),
      line("mouth-line", common.mouthLeft, common.mouthRight, 580),
      dot("forehead", common.forehead, 0),
      dot("left-eye", common.leftEyeOuter, 70),
      dot("right-eye", common.rightEyeOuter, 140),
      dot("mouth", common.mouthCenter, 210),
      dot("chin", common.chin, 280),
      label("overall-label", "PSL score", "[ measured ]", at("noseTip", 50, 44, offset(7, 0))),
    ],
  },
  "sun-damage": {
    id: "report-sun-damage",
    footer: "[ 011 ] SUN DAMAGE",
    primitives: [
      dot("forehead", at("forehead", 50, 31, offset(3.5, 7)), 0),
      dot("left-cheek", common.leftCheek, 120),
      dot("right-cheek", common.rightCheek, 240),
      line("uv-zone", at("forehead", 50, 31, offset(3.5, 7)), common.rightCheek, 360, true),
      label("uv-label", "UV signal", "[ low ]", at("rightEyeOuter", 68, 39, offset(6.5, 2.5))),
    ],
  },
};

const aliases: Record<string, keyof typeof presets> = {
  "skin-age": "biological-age",
};

export const reportOverlayPresets: Record<string, OverlayPreset> = presets;

export function getReportOverlayPreset(categoryId: string) {
  return reportOverlayPresets[categoryId] ?? reportOverlayPresets[aliases[categoryId]] ?? reportOverlayPresets.overall;
}
