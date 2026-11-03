import type { FaceAnchorKey, FaceContourKey, NormalizedPoint } from "./landmarks";

export type OverlayPointRef =
  | {
      anchor: FaceAnchorKey;
      fallback?: NormalizedPoint;
      offset?: NormalizedPoint;
    }
  | {
      contour: FaceContourKey;
      index: number;
      fallback?: NormalizedPoint;
      offset?: NormalizedPoint;
    }
  | {
      point: NormalizedPoint;
      offset?: NormalizedPoint;
    };

export type OverlayAnimation = {
  delay?: number;
  duration?: number;
  pulse?: boolean;
  entrance?: "draw" | "scale" | "slide";
};

export type OverlayPrimitive =
  | {
      id: string;
      kind: "point";
      at: OverlayPointRef;
      radius?: number;
      tone?: "halo" | "dot";
      animation?: OverlayAnimation;
    }
  | {
      id: string;
      kind: "line";
      from: OverlayPointRef;
      to: OverlayPointRef;
      dashed?: boolean;
      strokeWidth?: number;
      opacity?: number;
      animation?: OverlayAnimation;
    }
  | {
      id: string;
      kind: "box";
      from: OverlayPointRef;
      to: OverlayPointRef;
      points?: OverlayPointRef[];
      padding?: NormalizedPoint;
      dashed?: boolean;
      cornerOnly?: boolean;
      cornerLength?: number;
      fillOpacity?: number;
      radius?: number;
      strokeWidth?: number;
      opacity?: number;
      animation?: OverlayAnimation;
    }
  | {
      id: string;
      kind: "polyline";
      points: OverlayPointRef[];
      closed?: boolean;
      dashed?: boolean;
      strokeWidth?: number;
      opacity?: number;
      animation?: OverlayAnimation;
    }
  | {
      id: string;
      kind: "region";
      points: OverlayPointRef[];
      fillOpacity?: number;
      strokeWidth?: number;
      opacity?: number;
      dashed?: boolean;
      animation?: OverlayAnimation;
    }
  | {
      id: string;
      kind: "label";
      title: string;
      value?: string;
      at: OverlayPointRef;
      align?: "left" | "right";
      variant?: "tag" | "text" | "node";
      animation?: OverlayAnimation;
    };

export type OverlayPreset = {
  id: string;
  footer: string;
  primitives: OverlayPrimitive[];
};
