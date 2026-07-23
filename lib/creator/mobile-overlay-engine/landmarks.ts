export type NormalizedPoint = {
  x: number;
  y: number;
};

export type FaceLandmarkAnchors = {
  leftEyeOuter?: NormalizedPoint;
  leftEyeInner?: NormalizedPoint;
  rightEyeInner?: NormalizedPoint;
  rightEyeOuter?: NormalizedPoint;
  leftPupil?: NormalizedPoint;
  rightPupil?: NormalizedPoint;
  leftBrow?: NormalizedPoint;
  rightBrow?: NormalizedPoint;
  noseBridge?: NormalizedPoint;
  noseTip?: NormalizedPoint;
  mouthLeft?: NormalizedPoint;
  mouthRight?: NormalizedPoint;
  mouthCenter?: NormalizedPoint;
  upperLip?: NormalizedPoint;
  lowerLip?: NormalizedPoint;
  leftCheek?: NormalizedPoint;
  rightCheek?: NormalizedPoint;
  chin?: NormalizedPoint;
  jawLeft?: NormalizedPoint;
  jawRight?: NormalizedPoint;
  forehead?: NormalizedPoint;
};

export type FaceAnchorKey = keyof FaceLandmarkAnchors;

export type FaceLandmarkContours = {
  faceOutline?: NormalizedPoint[];
  leftEye?: NormalizedPoint[];
  rightEye?: NormalizedPoint[];
  leftBrow?: NormalizedPoint[];
  rightBrow?: NormalizedPoint[];
  noseBridge?: NormalizedPoint[];
  noseBase?: NormalizedPoint[];
  mouth?: NormalizedPoint[];
  jawline?: NormalizedPoint[];
  cheekbones?: NormalizedPoint[];
};

export type FaceContourKey = keyof FaceLandmarkContours;

export type FaceLandmarkBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FaceLandmarkBoxes = {
  face?: FaceLandmarkBox;
  leftEye?: FaceLandmarkBox;
  rightEye?: FaceLandmarkBox;
  nose?: FaceLandmarkBox;
  mouth?: FaceLandmarkBox;
  jaw?: FaceLandmarkBox;
};

export type FaceLandmarkQuality = {
  score: number;
  anchorCount?: number;
  contourPointCount?: number;
  faceCoverage?: number;
  rollRadians?: number;
  yawRadians?: number;
  symmetryError?: number;
  warnings?: string[];
};

export type FaceLandmarksPayload = {
  version: 1;
  source: "mediapipe-face-landmarker" | "apple-vision" | "kimi-vision-estimate" | "demo-static";
  confidence: number;
  image: {
    width: number;
    height: number;
  };
  anchors: FaceLandmarkAnchors;
  contours?: FaceLandmarkContours;
  boxes?: FaceLandmarkBoxes;
  quality?: FaceLandmarkQuality;
};

export function midpoint(a?: NormalizedPoint, b?: NormalizedPoint): NormalizedPoint | undefined {
  if (!a || !b) return undefined;

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function clampPoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

export function isFaceLandmarksUsable(landmarks: FaceLandmarksPayload | null | undefined, minScore = 0.58) {
  if (!landmarks) return false;
  if (landmarks.source === "demo-static") return true;
  if (landmarks.confidence < minScore) return false;
  if (typeof landmarks.quality?.score === "number" && landmarks.quality.score < minScore) return false;
  return Object.values(landmarks.anchors).filter(Boolean).length >= 8;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
