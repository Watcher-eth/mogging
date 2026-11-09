import type { SculptureStudy } from "./cephra-study";
import { prepareSculptureRenderer } from "./sculpture-renderer";
import { encodeCanvasMp4, downloadBlob } from "./export-slides";
import {
  sculptureRecording,
  sculptureScriptFrame,
  type SculptureScript,
} from "./cephra-scripts";
import { prepareSculptureReport } from "./sculpture-report";
import { drawSculptureScript } from "./sculpture-script-renderer";
export async function exportCephraDemo(
  study: SculptureStudy,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
  onRemaining?: (seconds: number | null) => void,
) {
  const renderer = await prepareSculptureRenderer(true),
    canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  try {
    const ctx = canvas.getContext("2d")!;
    const file = await encodeCanvasMp4(
      canvas,
      async (time) => {
        await renderer.seek(study, time, 6500, false, signal);
        renderer.draw(ctx, 1080, 1920);
      },
      6500,
      onProgress,
      signal,
      undefined,
      undefined,
      onRemaining,
    );
    downloadBlob(file, `mogging-sculpture-${study.feature}.mp4`);
  } finally {
    renderer.dispose();
  }
}

export async function exportCephraScript(
  script: SculptureScript,
  onProgress: (p: number) => void,
  signal?: AbortSignal,
  variation = 0,
  onRemaining?: (seconds: number | null) => void,
) {
  const recording = sculptureRecording(script);
  if (!recording)
    throw new Error("Record and align this script before exporting it.");
  const [report, response] = await Promise.all([
    prepareSculptureReport(script),
    fetch(recording.audio, { signal }),
  ]);
  if (!response.ok) throw new Error("The recorded narration could not load.");
  const renderer = await prepareSculptureRenderer(true);
  const audioContext = new AudioContext();
  try {
    const audio = await audioContext.decodeAudioData(
      await response.arrayBuffer(),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const file = await encodeCanvasMp4(
      canvas,
      async (time) => {
        const shot = sculptureScriptFrame(script, time, variation);
        if (!shot.report)
          await renderer.seek(
            shot.study,
            shot.time,
            shot.duration,
            false,
            signal,
            shot.previous,
          );
        else if (shot.previous && shot.reportTime < 1100)
          await renderer.seek(
            shot.previous.study,
            shot.previous.time,
            shot.previous.duration,
            false,
            signal,
          );
        drawSculptureScript(
          canvas.getContext("2d")!,
          renderer,
          report,
          script,
          time,
          1080,
          1920,
          false,
          variation,
        );
      },
      audio.duration * 1000,
      onProgress,
      signal,
      audio,
      undefined,
      onRemaining,
    );
    downloadBlob(file, `mogging-${script.id}.mp4`);
  } finally {
    renderer.dispose();
    await audioContext.close();
  }
}
