import { sampleCaptionAppearance } from "./caption-contrast";
import { sculptureScriptFrame, type SculptureScript } from "./cephra-scripts";
import {
  drawSculptureReport,
  drawSculptureReportInvitation,
  type SculptureReport,
} from "./sculpture-report";
import { sculptureEase } from "./cephra-study";
import { drawScanTicker } from "./brand";
import { drawLyricsCaption } from "./video-captions";
import { captionDesign, reportCaptionFrame, videoSize } from "./video-layout";
import { drawCaptionBackdrop } from "./video-progressive-blur";
import type { SculptureRenderer } from "./sculpture-renderer";
import type { VideoScene } from "./video-composition";

/** One caption/report compositor is shared by the script preview and MP4 export. */
export function drawSculptureScript(
  ctx: CanvasRenderingContext2D,
  renderer: SculptureRenderer,
  report: SculptureReport | undefined,
  script: SculptureScript,
  time: number,
  width: number,
  height: number,
  reduced = false,
  variation = 0,
) {
  const shot = sculptureScriptFrame(script, time, variation);
  if (shot.report && report) {
    if (shot.reportTime < 900 && !reduced) renderer.draw(ctx, width, height);
    drawSculptureReport(ctx, report, shot.reportTime, width, height, reduced);
  } else renderer.draw(ctx, width, height);
  const scene: VideoScene = {
    id: `sculpture-${shot.index}`,
    cueId: shot.section.role,
    startMs: 0,
    durationMs: shot.duration,
    label: script.title,
    text: shot.section.text,
    narration: shot.section.text,
    subtitle: "",
    focus: "hero",
    framing: "captioned",
    layout: "portrait",
    tracks: [],
    words: shot.words,
    captionScale: 0.8,
    source: {
      kind: shot.report ? "report" : "portrait",
      imageId: null,
      categoryId: script.categoryId,
      overlay: "none",
      currentScore: 0,
      potentialScore: 0,
      metricScore: 0,
    },
  };
  drawSculptureCaption(
    ctx,
    scene,
    shot.time,
    width,
    height,
    reduced,
    shot.report,
    shot.reportTime,
  );
  if (shot.report && report)
    drawSculptureReportInvitation(
      ctx,
      report,
      shot.reportTime,
      width,
      height,
      reduced,
    );
  if (!shot.report)
    drawScanTicker(ctx, report?.brand ?? null, time, reduced, width, height);
}

export function drawSculptureCaption(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  time: number,
  width: number,
  height: number,
  reduced: boolean,
  report = false,
  reportTime = Number.POSITIVE_INFINITY,
  theme: "light" | "dark" = "light",
) {
  ctx.save();
  ctx.scale(width / videoSize.width, height / videoSize.height);
  const move = report ? (reduced ? 1 : sculptureEase(reportTime / 900)) : 0;
  if (report) {
    ctx.save();
    ctx.globalAlpha *= move;
    drawCaptionBackdrop(ctx, {
      edge: "bottom",
      tint: "light",
      role: "caption",
      height: 820,
      theme,
    });
    ctx.restore();
  }
  ctx.translate(
    0,
    captionDesign.top + (reportCaptionFrame.y - captionDesign.top) * move,
  );
  drawLyricsCaption(
    ctx,
    scene,
    time,
    reduced,
    sampleCaptionAppearance(
      ctx,
      { x: 0, y: 0, width: videoSize.width, height: 190 },
      theme === "dark" ? "#f5f5f3" : "#302d29",
    ).ink,
    undefined,
    captionDesign.width + (916 - captionDesign.width) * move,
    400,
    60,
  );
  ctx.restore();
}
