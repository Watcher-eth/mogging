import { editorialCursorTiming } from "./editorial-cursor";
import {
  BufferGeometry,
  Float32BufferAttribute,
  BufferAttribute,
  Vector3,
  Mesh,
} from "three";
import {
  SculptureMorphs,
  drawSculptureComposition,
} from "./sculpture-renderer";
import { MeshBVH } from "three-mesh-bvh";
import featureCatalog from "./sculpture-features.json";
import {
  sculptureScripts,
  legacySculptureScripts,
  sculptureScriptFrame,
  sculptureScriptDuration,
  sculptureScriptStudy,
  sculptureRecording,
  sculptureStoryTreatments,
  sculptureProductionScript,
  sculptureVoice,
} from "./cephra-scripts";
import {
  compileProductionVideo,
  restoreProductionRecording,
  assembleProductionAudio,
} from "./video-production";
import { reportCategories } from "./mock-report-data";
import { sculptureReportMetric } from "./sculpture-report";
import {
  creatorStoryDirections,
  creatorStoryCut,
  creatorAnalysisReports,
  creatorSubjectAnalysisSchema,
} from "./creator-stories";
import registrations from "./sculpture-registration.json";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  sculptureSchema,
  sculptureFrameCenter,
  sculpturePrimitiveVariation,
  sculptureFeatures,
  sculptureTreatments,
  sculptureInsetFrame,
  sculptureSample,
  sculptureHandoff,
  sculptureInstrumentMotion,
  sculptureFeatureForText,
  sculptureSceneClock,
  planSculptureScenes,
  sculptureAnglePoints,
  sculptureTargetAnchor,
  sculptureGuideAnchors,
  sculptureNarrationGuides,
  sculptureLayerMotion,
  sculptureLayerEdge,
  sculptureUnderEar,
  sculptureCutawaySurface,
  sculptureWindowContour,
} from "./cephra-study";
import { creatorContentStyle, chooseCreatorTake } from "./creator-catalog";
import type { VideoScene } from "./video-composition";

const study = sculptureSchema.parse({ feature: "jaw-width", from: 0, to: 0.6 });
test("approved Cephra performances assemble every observed word and their matching sculpture demo", () => {
  for (const story of sculptureScripts) {
    const saved = restoreProductionRecording(
      JSON.parse(
        readFileSync(
          `public/creator/sculpture/voices/${story.id}-recording.json`,
          "utf8",
        ),
      ),
    );
    const reports = reportCategories;
    const images = [
      {
        id: `sculpture-${story.model}`,
        name: "Sculpture",
        dataUrl: "/sculpture.webp",
        width: 1080,
        height: 1920,
        landmarks: null,
        status: "ready" as const,
      },
    ];
    const input = {
      formatId: "score-reveal",
      subject: "Sculpture",
      hook: story.title,
      overallScore: "",
      potentialScore: "",
      strongestFeature: "",
      strongestScore: "",
      opportunityFeature: "",
      opportunityScore: "",
      recommendation: "",
      productFeatures: [],
      cta: "Mogging.com",
    } as const;
    const selected = {
      id: story.id,
      title: story.title,
      sculptureScriptId: story.id,
      images,
      evidence: {
        baselineId: images[0].id,
        comparisonId: images[0].id,
        topic: "whole" as const,
        revealLabel: "",
      },
    };
    const directions = creatorStoryDirections(
      selected,
      saved.script,
      { ...input, productFeatures: [] },
      images,
      reports,
      "sculpture-study",
      3,
    );
    const composition = compileProductionVideo(
      saved.script,
      { ...input, productFeatures: [] },
      images,
      reports,
      "sculpture-study",
      saved.voice,
      3,
      undefined,
      1,
      directions,
    );
    const result = assembleProductionAudio(composition, saved.clips);
    expect(result.alignmentError).toBeUndefined();
    expect(result.composition.timing).toBe("words");
    expect(result.composition.recording!.words.length).toBe(
      saved.script.cues.reduce(
        (count, cue) =>
          count +
          cue.text.match(/[\p{L}\p{N}]+(?:['’.][\p{L}\p{N}]+)*/gu)!.length,
        0,
      ),
    );
    expect(result.composition.scenes.at(-1)!.source.report?.id).toBe(story.categoryId);
    if (story.authored) {
      expect(result.composition.scenes.at(-1)!.focus).toBe(`feature:${story.reportMetricId}`);
      expect(result.composition.durationMs).toBeCloseTo(sculptureScriptDuration(story), 0);
      const studies = result.composition.scenes.flatMap(scene => scene.sculpture ? [scene.sculpture] : []);
      expect(studies.some(study => study.narrationTriggerMs !== undefined)).toBe(true);
      expect(studies.some(study => study.feature === story.feature)).toBe(true);
    }
    expect(result.composition.scenes.at(-1)!.source.report?.score).toBe(
      reports.find((report) => report.id === story.categoryId)!.score,
    );
  }
});
test("approved scripts preserve the reviewed words, full cut, source citations and distinct feature beats", () => {
  const approved = JSON.parse(
    readFileSync("/Users/watcher/Documents/Codex/2026-10-27/ca/outputs/cephra-study/script-drafts-v4.json", "utf8"),
  );
  for (const script of sculptureScripts.filter(story => !story.authored)) {
    const draft = approved.find(
      (item: { id: string }) => item.id === script.id,
    );
    expect(script.sections.map((section) => section.text).join(" ")).toBe(
      draft.sections.map((section: { text: string }) => section.text).join(" "),
    );
    expect(
      new Set(script.sections.map((section) => section.study?.feature)).size,
    ).toBeGreaterThan(4);
    expect(sculptureScriptDuration(script)).toBeGreaterThan(50000);
    const production = sculptureProductionScript(script);
    expect(production.references?.length).toBeGreaterThan(0);
    const last = sculptureScriptFrame(
      script,
      sculptureScriptDuration(script) - 1,
    );
    expect(last.report).toBe(true);
    expect(last.section.role).toBe("close");
  }
});
test("close-up windows stay near the feature, below/right of a low jaw and clear of feed controls", () => {
  const jaw = { x: 1080 * 0.35, y: 1920 * 0.63 };
  const frame = sculptureInsetFrame(jaw, 1080, 1920);
  expect(frame.x).toBeGreaterThan(jaw.x);
  expect(frame.y + frame.height / 2).toBeGreaterThan(jaw.y);
  for (const anchor of [
    { x: 100, y: 500 },
    { x: 1000, y: 1500 },
    { x: 540, y: 800 },
  ]) {
    const card = sculptureInsetFrame(anchor, 1080, 1920, true);
    expect(card.x).toBeGreaterThanOrEqual(1080 * 0.08);
    expect(card.x + card.width).toBeLessThanOrEqual(1080 * 0.81 + 0.001);
    expect(card.y).toBeGreaterThanOrEqual(1920 * 0.25);
    expect(card.y + card.height).toBeLessThanOrEqual(1920 * 0.7 + 0.001);
  }
});
test("the spoken under-ear cue keeps the jaw guide on the same anatomical point across variations", () => {
  const script = sculptureScripts.find((story) => story.id === "jaw-layers-v4")!;
  const index = script.sections.findIndex((section) => sculptureUnderEar.test(section.text));
  const clip = sculptureRecording(script)!.sections[index];
  const earCue = clip.words!.find((word) => word.text === "ear")!.startMs;
  const { ear, jawHinge, chin, jaw } = registrations[script.model].anchors;
  expect(jawHinge[1]).toBeLessThan(ear[1]);
  expect(jawHinge[1]).toBeGreaterThan(chin[1]);
  expect(Math.abs(jawHinge[2] - ear[2])).toBeLessThan(Math.abs(jaw[2] - ear[2]));
  const treatments = new Set();
  for (let variation = 0; variation < 12; variation++) {
    const study = sculptureScriptStudy(script, index, variation);
    treatments.add(study.treatment);
    expect(sculptureTargetAnchor(study)).toBe("jawHinge");
    expect(sculptureSample(study, earCue, clip.durationMs).clickAt).toBe(earCue);
  }
  expect(treatments.has("inset")).toBe(true);
});
test("short sculpture cuts retain complete recorded sentences, a hook and the app ending within their measured length", () => {
  for (const story of sculptureScripts.filter(story => !story.authored)) {
    const saved = restoreProductionRecording(
      JSON.parse(
        readFileSync(
          `public/creator/sculpture/voices/${story.id}-recording.json`,
          "utf8",
        ),
      ),
    );
    const selected = {
      id: story.id,
      title: story.title,
      sculptureScriptId: story.id,
      images: [],
      evidence: {
        baselineId: "source",
        comparisonId: "source",
        topic: "whole" as const,
        revealLabel: "",
      },
    };
    for (const seconds of [30, 45] as const) {
      const cut = creatorStoryCut(saved.script, seconds, selected);
      const duration = cut.cues.reduce(
        (sum, cue) =>
          sum +
          saved.clips.get(
            JSON.stringify([cue.id, cue.text, cue.delivery, saved.voice]),
          )!.pcm.byteLength /
            48,
        0,
      );
      expect(duration).toBeLessThanOrEqual(seconds * 1000);
      expect(duration).toBeGreaterThan((seconds - 3) * 1000);
      expect(cut.cues[0].section!.role).toBe("hook");
      expect(cut.cues.at(-1)!.section!.role).toBe("takeaway");
      expect(cut.cues.map((cue) => cue.sourceId)).toEqual(
        story.cuts![seconds]!,
      );
    }
    const signatures = Array.from({ length: 60 }, (_, variation) =>
      JSON.stringify(
        story.sections.map((_, i) => {
          const beat = sculptureScriptStudy(story, i, variation);
          return [
            beat.treatment,
            beat.camera,
            beat.accent,
            beat.background,
            beat.zoom,
          ];
        }),
      ),
    );
    expect(new Set(signatures).size).toBeGreaterThan(40);
  }
});
test("variation reaches playback without changing narration, anatomy or experimental controls", () => {
  const visualKeys = [
    "treatment",
    "camera",
    "view",
    "background",
    "accent",
    "zoom",
  ] as const;
  for (const script of sculptureScripts.filter(story => !story.authored)) {
    for (let seed = 0; seed < 24; seed++) {
      const first = script.sections.map((_, i) =>
        sculptureScriptStudy(script, i, seed),
      );
      const next = script.sections.map((_, i) =>
        sculptureScriptStudy(script, i, seed + 1),
      );
      expect(
        [...visualKeys, "material" as const].filter(
          (key) => first[0][key] !== next[0][key],
        ).length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        first.filter((shot, i) =>
          visualKeys.some((key) => shot[key] !== next[i][key]),
        ).length,
      ).toBeGreaterThan(script.sections.length / 2);
      for (const [i, section] of script.sections.entries()) {
        if (!section.study) continue;
        const authored = sculptureSchema.parse(section.study);
        expect(next[i].feature).toBe(authored.feature);
        if (section.variationMorph) {
          expect(next[i].from).toBe(0);
          expect([
            authored.to,
            section.variationMorph.to,
            -section.variationMorph.to,
          ]).toContain(next[i].to);
        } else {
          expect(next[i].from).toBe(authored.from);
          expect(next[i].to).toBe(authored.to);
        }
        expect(next[i].showMeasurements).toBe(authored.showMeasurements);
        if (
          section.study.feature === "camera-distance" ||
          section.study.lighting === "sweep"
        ) {
          expect(next[i].camera).toBe(section.camera);
          expect(next[i].view).toBe(authored.view);
          expect(next[i].zoom).toBe(1);
        }
        expect(next[i].reference).toEqual(section.study.reference);
        expect(next[i].revealRegion).toBe(authored.revealRegion);
      }
      const frame = sculptureScriptFrame(script, 0, seed + 1);
      expect(frame.study).toEqual(next[0]);
      expect(frame.section.text).toBe(script.sections[0].text);
      expect(frame.duration).toBe(
        sculptureScriptFrame(script, 0, seed).duration,
      );
    }
  }
});
test("recorded stories vary primary editing sequences, not just camera and decoration", () => {
  const combinedEffects = new Set<string>();
  for (const script of sculptureScripts.filter(story => !story.authored)) {
    const count = script.sections.filter((section) => section.study).length;
    const sequences = Array.from({ length: 128 }, (_, seed) =>
      sculptureStoryTreatments(script, seed).slice(0, count),
    );
    expect(new Set(sequences.map((sequence) => sequence.join("/"))).size).toBe(
      128,
    );
    for (const [seed, sequence] of sequences.entries()) {
      sequence.forEach((effect) => combinedEffects.add(effect));
      if (seed)
        expect(
          sequence.filter((effect, i) => effect !== sequences[seed - 1][i])
            .length,
        ).toBeGreaterThanOrEqual(Math.floor(count * 0.65));
      expect(
        sequence.filter((effect) => effect === "comparison").length,
      ).toBeLessThanOrEqual(1);
      for (let i = 1; i < sequence.length; i++)
        expect(sequence[i]).not.toBe(sequence[i - 1]);
    }
    // Bone windows are a valid anatomy option, not the compulsory opening of every take.
    if (script.categoryId === "jaw") {
      expect(
        new Set(sequences.map((sequence) => sequence.indexOf("bone-window")))
          .size,
      ).toBeGreaterThan(3);
      expect(
        sequences.some((sequence) => !sequence.includes("bone-window")),
      ).toBe(true);
      expect(
        new Set(sequences.map((sequence) => sequence[5])).size,
      ).toBeGreaterThan(5);
    }
  }
  expect(combinedEffects.size).toBeGreaterThanOrEqual(18);
  expect(combinedEffects.has("landmark-gauge")).toBe(true);
  expect(combinedEffects.has("level-gauge")).toBe(true);
  expect(combinedEffects.has("profile-offset")).toBe(true);
});
test("a recorded profile proof holds the neutral sculpture until its second named landmark", () => {
  const script = sculptureScripts.find(story => story.id === "selfie-perspective-v4")!;
  const index = script.sections.findIndex(section => section.id === "demonstrate-1");
  const shot = Array.from({length:64}, (_, seed) => sculptureScriptStudy(script,index,seed))
    .find(shot => shot.treatment === "profile-offset")!;
  const recording = sculptureRecording(script)!.sections[index];
  expect(sculptureGuideAnchors(shot)).toEqual(["chin","nose"]);
  expect(shot.view).toBe("profile");
  expect(shot.narrationTriggerMs).toBe(recording.words.find(word=>word.text==="chin")?.startMs);
  expect(shot.guideEndMs).toBe(recording.words.find(word=>word.text==="nose")?.startMs);
  expect(sculptureSample(shot,shot.guideEndMs!,recording.durationMs).value).toBe(shot.from);
  expect(sculptureSample(shot,shot.guideEndMs!+670,recording.durationMs).value).not.toBe(shot.from);
});
test("profile construction connects only after the recorded points and a layer separates after the scan",()=>{
  const feature="chin-projection",treatment="profile-chain";
  const cues=sculptureNarrationGuides({feature,treatment},[
    {text:"brow",startMs:240},{text:"nose,",startMs:840},
    {text:"chin.",startMs:1500},{text:"connect",startMs:2120},
  ]);
  expect(cues).toEqual({narrationTriggerMs:240,guideMiddleMs:840,guideEndMs:1500,guideConnectMs:2120});
  expect(sculptureGuideAnchors({feature,treatment})).toEqual(["glabella","noseBase","chin"]);
  const shot=sculptureSchema.parse({feature,treatment,from:0,to:.2,...cues});
  expect(sculptureSample(shot,2120,4000).value).toBe(0);
  expect(sculptureSample(shot,2800,4000).value).toBeGreaterThan(0);
  expect(sculptureLayerMotion(399,4000,400)).toEqual({reveal:0,separate:0});
  expect(sculptureLayerMotion(860,4000,400)).toEqual({reveal:1,separate:0});
  expect(sculptureLayerMotion(1600,4000,400)).toEqual({reveal:1,separate:1});
  expect(sculptureLayerEdge([{y:140},{y:100},{y:200}],.3)).toBe(130);
});
test("actual morphs combine with different compositions only on authored explanatory beats", () => {
  for (const script of sculptureScripts.filter(story => !story.authored)) {
    const combinations = new Set<string>();
    let unchanged = 0;
    for (let seed = 0; seed < 64; seed++)
      for (const [i, section] of script.sections.entries()) {
        if (!section.variationMorph) continue;
        const shot = sculptureScriptStudy(script, i, seed);
        if (shot.to !== shot.from) {
          expect(Math.abs(shot.to)).toBeLessThanOrEqual(0.22);
          expect(shot.restore).toBe(true);
          combinations.add(shot.treatment);
        } else unchanged++;
      }
    expect(combinations.has("morph")).toBe(true);
    expect(combinations.size).toBeGreaterThan(6);
    expect(unchanged).toBeGreaterThan(0);
  }
});
test("primitive variations explore all registered features and compositions", () => {
  const takes = Array.from({ length: 180 }, (_, seed) =>
    sculpturePrimitiveVariation(study, seed),
  );
  expect(new Set(takes.map((take) => take.feature)).size).toBe(
    sculptureFeatures.length,
  );
  expect(new Set(takes.map((take) => take.treatment)).size).toBe(
    sculptureTreatments.length,
  );
  for (const [key, count] of [
    ["model", 5],
    ["material", 3],
    ["view", 3],
    ["camera", 6],
    ["background", 3],
    ["accent", 4],
    ["instrument", 4],
  ] as const) {
    expect(new Set(takes.map((take) => take[key])).size).toBe(count);
  }
});
test("shot handoffs and report chapters stay deterministic across seeks and caption splits", () => {
  for (const script of sculptureScripts) {
    let start = 0;
    for (let i = 0; i < script.sections.length; i++) {
      const shot = sculptureScriptFrame(script, start + 0.001, 2);
      expect(shot.index).toBe(i);
      if (i > 0 && !shot.report) {
        const before = sculptureScriptFrame(script, start - 0.001, 2);
        expect(shot.previous?.study).toEqual(before.study);
        expect(shot.previous?.duration).toBe(before.duration);
      }
      if (shot.report && i > 0) {
        const before = sculptureScriptFrame(script, start - 0.001, 2);
        if (before.report)
          expect(Math.abs(shot.reportTime - before.reportTime)).toBeLessThan(
            0.003,
          );
      }
      start += shot.duration;
    }
  }
  for (const duration of [700, 1800, 6000]) {
    expect(sculptureHandoff(0, duration)).toBe(0);
    const end = Math.min(1100, duration * 0.4);
    expect(sculptureHandoff(end, duration)).toBe(1);
    expect(sculptureHandoff(1, duration)).toBeLessThan(0.00001);
    expect(sculptureHandoff(end - 1, duration)).toBeGreaterThan(0.99999);
    expect(sculptureHandoff(0, duration, true)).toBe(1);
  }
});
test("instrument markers travel after the tick reveal instead of sharing its clock", () => {
  expect(sculptureInstrumentMotion(500).rail).toBeGreaterThan(0);
  expect(sculptureInstrumentMotion(500).marker).toBe(0);
  expect(sculptureInstrumentMotion(900).rail).toBe(1);
  expect(sculptureInstrumentMotion(900).marker).toBeGreaterThan(0);
  expect(sculptureInstrumentMotion(900).marker).toBeLessThan(0.1);
  expect(sculptureInstrumentMotion(1760).marker).toBe(1);
  expect(sculptureInstrumentMotion(0, true)).toEqual({
    entry: 1,
    rail: 1,
    marker: 1,
    markerOpacity: 1,
  });
});
test("sculpture endings select an existing script-relevant native grid metric", () => {
  for (const story of [...sculptureScripts, ...legacySculptureScripts]) {
    const metricId = story.reportMetricId ?? sculptureReportMetric(story.categoryId);
    const category = reportCategories.find(
      (category) => category.id === story.categoryId,
    )!;
    expect(category.features.some((feature) => feature.id === metricId)).toBe(
      true,
    );
    expect(metricId).not.toBe("overall.psl");
  }
  expect(sculptureReportMetric("jaw")).toBe("jaw.width");
  expect(sculptureReportMetric("overall")).toBe("overall.proportions");
});
test("sculpture framing centers horizontally using each model's registered anatomy", () => {
  for (const model of ["female", "male"] as const) {
    const anchors = registrations[model].anchors;
    const center = sculptureFrameCenter(anchors);
    expect(Math.abs(center.x)).toBeLessThan(0.01);
    expect(center.z).toBeGreaterThan(0.04);
    expect(center.z).toBeLessThan(anchors.nose[2]);
    expect(Object.values(center).every(Number.isFinite)).toBe(true);
  }
});
test("dark sculpture paper themes the frame and fade without filtering or recoloring the surface", () => {
  const image = { width: 810, height: 1080 } as HTMLCanvasElement;
  const fills: string[] = [],
    stops: string[] = [],
    images: unknown[] = [],
    state: Record<string, unknown> = { globalAlpha: 1, filter: "none" };
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === "createLinearGradient")
          return () => ({
            addColorStop: (_: number, color: string) => stops.push(color),
          });
        if (key === "fillRect")
          return () => fills.push(String(state.fillStyle));
        if (key === "measureText") return (text: string) => ({width:text.length*6});
        if (key === "drawImage")
          return (source: unknown) => images.push(source);
        if (key === "getTransform")
          return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return state[String(key)] ?? (() => {});
      },
      set: (_, key, value) => {
        state[String(key)] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  drawSculptureComposition(
    ctx,
    image,
    undefined,
    {},
    sculptureSchema.parse({
      feature: "jaw-width",
      from: 0,
      to: 0,
      showGuides: false,
      instrument: "none",
    }),
    0,
    3000,
    1080,
    1920,
    true,
    undefined,
    0,
    "dark",
  );
  expect(fills[0]).toBe("rgba(17,17,17,1)");
  expect(stops.at(-1)).toBe("rgba(17,17,17,1)");
  expect(images).toEqual([image]);
  expect(state.filter).toBe("none");
});
test("all facial regions have nondegenerate registered angle and cutaway constructions", () => {
  expect(sculptureAnglePoints("lip-fullness")).toEqual([
    "mouthLeft",
    "upperLip",
    "mouthRight",
  ]);
  expect(sculptureAnglePoints("nose-tip")).toEqual([
    "glabella",
    "nose",
    "noseBase",
  ]);
  for (const model of ["male", "female"] as const)
    for (const feature of Object.keys(featureCatalog) as Array<
      keyof typeof featureCatalog
    >) {
      const shot = sculptureSchema.parse({
        feature,
        model,
        treatment: "bone-window",
      });
      const surface = sculptureCutawaySurface(shot),
        registration = registrations[model];
      expect(
        registration.contours[
          surface.contour as keyof typeof registration.contours
        ].length,
      ).toBe(49);
      const [a, b, c] = sculptureAnglePoints(feature).map(
        (name) =>
          new Vector3(
            ...(registration.anchors[
              name as keyof typeof registration.anchors
            ] as [number, number, number]),
          ),
      );
      expect(a.clone().sub(b).cross(c.clone().sub(b)).length()).toBeGreaterThan(
        1e-8,
      );
    }
});
test("bone-window outline shares the reveal geometry through opening and closing", () => {
  const shot = sculptureSchema.parse({
    feature: "jaw-width",
    treatment: "bone-window",
    from: 0,
    to: 0.6,
  });
  const contour = [
      { x: 1, y: 3 },
      { x: 5, y: 7 },
    ],
    center = { x: 2, y: 4 };
  expect(sculptureWindowContour(contour, center, 0)).toEqual([center, center]);
  expect(sculptureWindowContour(contour, center, 1)).toEqual(contour);
  for (const time of [650, 1200, 2600, 5000, 6200]) {
    const scale = sculptureSample(shot, time, 6500).progress;
    const points = sculptureWindowContour(contour, center, scale);
    expect(
      Math.hypot(points[0].x - center.x, points[0].y - center.y),
    ).toBeCloseTo(Math.sqrt(2) * scale, 8);
  }
  for (const model of ["male", "female"] as const) {
    const points = registrations[model].contours["cutaway-jaw"];
    expect(
      Math.max(...points.map((p) => p[0])) -
        Math.min(...points.map((p) => p[0])),
    ).toBeGreaterThan(0.045);
    const nose = registrations[model].contours["cutaway-nose"];
    expect(
      Math.max(...nose.map((p) => p[1])) - Math.min(...nose.map((p) => p[1])),
    ).toBeGreaterThan(0.045);
  }
});
test("viewer-led sculpture scripts retain their feature and finish on a populated category report", () => {
  const input = {
    formatId: "score-reveal",
    subject: "Example",
    hook: "Facial relationships",
    overallScore: "7",
    potentialScore: "8",
    strongestFeature: "Eyes",
    strongestScore: "8",
    opportunityFeature: "Jaw",
    opportunityScore: "6",
    recommendation: "Compare consistent photographs.",
    productFeatures: [],
    cta: "Mogging.com",
  } as const;
  for (const story of sculptureScripts) {
    const script = sculptureProductionScript(story);
    const images = [
      {
        id: "source",
        name: "Saved portrait",
        dataUrl: "/source.jpg",
        width: 1080,
        height: 1920,
        status: "ready" as const,
        landmarks: null,
      },
    ];
    const directions = creatorStoryDirections(
      {
        id: story.id,
        title: story.title,
        sculptureScriptId: story.id,
        images,
        evidence: {
          baselineId: "source",
          comparisonId: "source",
          topic: story.categoryId === "mouth" ? "lips" : "jaw",
          revealLabel: story.title,
        },
      },
      script,
      { ...input, productFeatures: [] },
      images,
      reportCategories,
      "sculpture-study",
      2,
    );
    const result = compileProductionVideo(
      script,
      { ...input, productFeatures: [] },
      images,
      reportCategories,
      "sculpture-study",
      sculptureVoice(story),
      2,
      undefined,
      1,
      directions,
    );
    expect(result.scenes.at(-1)!.source.kind).toBe("report");
    expect(
      result.scenes.at(-1)!.source.report?.features.length,
    ).toBeGreaterThan(0);
    expect(result.scenes.at(-1)!.source.categoryId).toBe(story.categoryId);
    expect(
      result.scenes
        .filter((scene) => scene.sculpture)
        .every((scene) =>
          story.sections.some(
            (section) =>
              (section.study?.feature ?? story.feature) ===
              scene.sculpture!.feature,
          ),
        ),
    ).toBe(true);
  }
});
test("sculptures upload only the active morph pair without changing surface positions", () => {
  const source = new BufferGeometry();
  source.setAttribute("position", new Float32BufferAttribute([1, 2, 3], 3));
  source.morphTargetsRelative = true;
  source.morphAttributes.position = [1, 2, 3, 4].map(
    (x) => new Float32BufferAttribute([x, 0, 0], 3),
  );
  const mesh = new Mesh(source);
  mesh.morphTargetDictionary = {
    "jaw-width-low": 0,
    "jaw-width-high": 1,
    "chin-height-low": 2,
    "chin-height-high": 3,
  };
  const morphs = new SculptureMorphs();
  morphs.select(mesh, "jaw-width");
  expect(mesh.geometry.morphAttributes.position?.length).toBe(2);
  expect(mesh.geometry.attributes.position).toBe(source.attributes.position);
  mesh.morphTargetInfluences![1] = 0.5;
  expect(mesh.getVertexPosition(0, new Vector3()).toArray()).toEqual([2, 2, 3]);
  const view = mesh.geometry;
  morphs.select(mesh, "jaw-width");
  expect(mesh.geometry).toBe(view);
  morphs.select(mesh, "chin-height");
  expect(mesh.morphTargetInfluences).toEqual([0, 0]);
  mesh.morphTargetInfluences![0] = 0.5;
  expect(mesh.getVertexPosition(0, new Vector3()).toArray()).toEqual([
    2.5, 2, 3,
  ]);
  morphs.select(mesh, "camera-distance");
  expect(mesh.geometry.morphAttributes.position).toBeUndefined();
  expect(mesh.morphTargetInfluences).toBeUndefined();
  expect(mesh.getVertexPosition(0, new Vector3()).toArray()).toEqual([1, 2, 3]);
  morphs.release(mesh);
  expect(mesh.geometry).toBe(source);
  expect(source.morphAttributes.position.length).toBe(4);
});
const scene = (id: string, startMs: number): VideoScene => ({
  id,
  startMs,
  durationMs: 2000,
  cueId: "jaw",
  narration: "The jaw gets wider.",
  tracks: [],
  label: "Jaw study",
  text: "The jaw gets wider.",
  subtitle: "",
  focus: "jaw",
  framing: "captioned",
  layout: "portrait",
  source: {
    kind: "portrait",
    imageId: null,
    categoryId: "jaw",
    overlay: "none",
    currentScore: 7,
    potentialScore: 8,
    metricScore: 7,
  },
  sculpture: study,
});
describe("continuous sculptural demonstration", () => {
  test("click precedes anatomy and reset returns to the identical baseline", () => {
    expect(sculptureSample(study, 0, 6500).value).toBe(0);
    expect(sculptureSample(study, 649, 6500).value).toBe(0);
    expect(sculptureSample(study, 2500, 6500).value).toBeCloseTo(0.6);
    expect(sculptureSample(study, 6499, 6500).value).toBe(0);
    for (let time = 0; time < 6500; time += 17) {
      const value = sculptureSample(study, time, 6500).value;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0.6);
    }
  });
  test("short clips keep the native click and anatomy on the same clock", () => {
    for (const duration of [600, 1200, 6500])
      for (let variant = 0; variant < 6; variant++) {
        const shot = sculptureSchema.parse({ ...study, variant });
        const sample = sculptureSample(shot, 0, duration);
        expect(
          editorialCursorTiming(sample.clickAt, variant, "click").clickAtMs,
        ).toBe(sample.clickAt);
        expect(sculptureSample(shot, sample.clickAt - 1, duration).value).toBe(
          shot.from,
        );
      }
  });
  test("caption fragments share a clock but a later reuse starts again", () => {
    const a = scene("a", 0),
      b = scene("b", 2000),
      c = { ...scene("c", 4000), cueId: "other" };
    expect(sculptureSceneClock([a, b, c], b, 500)).toEqual({
      startIndex: 0,
      time: 2500,
      duration: 4000,
    });
    expect(sculptureSceneClock([a, b, c], c, 500)).toEqual({
      startIndex: 2,
      time: 500,
      duration: 2000,
    });
  });
  test("draft choreography conceals its variable and preserves the result between sections", () => {
    for (const script of legacySculptureScripts) {
      const first = sculptureScriptFrame(script, 0);
      expect(first.study.showGuides).toBe(false);
      expect(
        sculptureSample(first.study, first.duration - 1, first.duration).value,
      ).toBeCloseTo(first.study.to, 10);
      const next = sculptureScriptFrame(script, first.duration);
      expect(next.study.from).toBeCloseTo(first.study.to, 10);
      expect(next.study.showGuides).toBe(true);
      expect(next.study.showMeasurements).toBe(false);
      const reveal = sculptureScriptFrame(
        script,
        first.duration + next.duration,
      );
      expect(reveal.section.role).toBe("reveal");
      expect(reveal.study.showGuides).toBe(true);
      const end = sculptureScriptFrame(
        script,
        sculptureScriptDuration(script) - 1,
      );
      expect(end.study.from).toBe(first.study.from);
      expect(end.study.to).toBe(first.study.from);
    }
  });
  test("story instruments belong only to measurement beats, with clean holds and varied treatments", () => {
    for (const script of legacySculptureScripts) {
      const treatments = new Set<string>();
      for (let variation = 0; variation < 6; variation++) {
        const beats = script.sections.map((_, index) =>
          sculptureScriptStudy(script, index, variation),
        );
        expect(
          beats.filter((beat) => beat.instrument !== "none").length,
        ).toBeLessThanOrEqual(1);
        for (const beat of beats.filter(
          (beat) => beat.treatment === "bone-window",
        )) {
          expect(beat.instrument).toBe("none");
        }
        for (const index of [0, 1, 4, 5]) {
          expect(beats[index].instrument).toBe("none");
          expect(beats[index].showMeasurements).toBe(false);
        }
        for (const beat of beats) treatments.add(beat.treatment);
      }
      expect(treatments.size).toBeGreaterThanOrEqual(8);
    }
  });
  test("generated measurement cues do not repeat instruments across caption fragments or adjacent beats", () => {
    const shots = Array.from({ length: 3 }, (_, index) => ({
      ...scene(`measure-${index}`, index * 2000),
      cueId: `measure-${index}`,
      sculpture: undefined,
      narration: "The gonial angle measures the jaw corner.",
    }));
    const fragment = { ...shots[0], id: "fragment", startMs: 500 };
    const planned = planSculptureScenes(
      [shots[0], fragment, ...shots.slice(1)],
      "Marlon",
      0,
    );
    expect(planned[0].sculpture?.instrument).not.toBe("none");
    expect(planned[1].sculpture?.instrument).toBe(
      planned[0].sculpture?.instrument,
    );
    expect(planned[2].sculpture?.instrument).toBe("none");
    const observation = planSculptureScenes(
      [
        {
          ...shots[0],
          narration: "The shadow follows your jaw when you turn.",
        },
      ],
      "Marlon",
      0,
    )[0];
    expect(observation.sculpture?.instrument).toBe("none");
  });
  test("a changing pose does not become an anatomical edit", () => {
    const shot = {
      ...scene("pose", 0),
      sculpture: undefined,
      narration: "His jaw outline changes as he turns his head.",
    };
    const planned = planSculptureScenes([shot], "Marlon", 0)[0];
    expect(planned.sculpture?.to).toBe(0);
    expect(planned.sculpture?.camera).toBe("orbit");
    for (let variation = 0; variation < 6; variation++)
      expect(
        planSculptureScenes(
          [{ ...shot, narration: "Open the jaw angle slightly." }],
          "Marlon",
          variation,
        )[0].sculpture?.treatment,
      ).not.toBe("bone-window");
  });
  test("score evidence never becomes an invented sculptural score", () => {
    const scored = {
      ...scene("score", 0),
      narration: "His jaw scores seven.",
      scoreCallouts: [{ label: "Jaw", value: 7, word: 3 }],
      sculpture: undefined,
    };
    expect(planSculptureScenes([scored], "Marlon", 3)[0]).toBe(scored);
    expect(
      sculptureFeatureForText("Midface projection changes the profile."),
    ).toBe("midface-projection");
    expect(creatorContentStyle("sculpture-study").id).toBe("cephra");
    expect(
      chooseCreatorTake(
        "cephra",
        [
          { id: "story", recording: "yes" },
          { id: "report", kind: "score-walkthrough", recording: "yes" },
        ],
        undefined,
        () => 0.3,
      ).storyId,
    ).toBe("story");
  });
});

/** Check the actual shipping binary, not a manifest that could conceal a broken export. */
for (const model of ["male", "female", "classical", "textured", "swept"] as const)
  test(`${model} asset has a neutral baseline and bounded, finite fixed-topology morphs`, () => {
    const bytes = readFileSync(`public/creator/sculpture/${model}.glb`),
      jsonLength = bytes.readUInt32LE(12),
      gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()),
      binary = bytes.subarray(28 + jsonLength);
    const values = (index: number) => {
      const a = gltf.accessors[index],
        result = new Float32Array(a.count * 3);
      if (a.bufferView !== undefined) {
        const v = gltf.bufferViews[a.bufferView],
          offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
        result.set(
          new Float32Array(
            binary.buffer,
            binary.byteOffset + offset,
            a.count * 3,
          ),
        );
      }
      if (a.sparse) {
        const { indices, values, count } = a.sparse,
          iv = gltf.bufferViews[indices.bufferView],
          vv = gltf.bufferViews[values.bufferView],
          start = (iv.byteOffset ?? 0) + (indices.byteOffset ?? 0),
          data = new Float32Array(
            binary.buffer,
            binary.byteOffset + (vv.byteOffset ?? 0) + (values.byteOffset ?? 0),
            count * 3,
          );
        for (let i = 0; i < count; i++) {
          const id =
            indices.componentType === 5125
              ? binary.readUInt32LE(start + i * 4)
              : indices.componentType === 5123
                ? binary.readUInt16LE(start + i * 2)
                : binary[start + i];
          result.set(data.subarray(i * 3, i * 3 + 3), id * 3);
        }
      }
      return result;
    };
    // A frontal cheek ray formerly placed this jaw-angle point too high.
    const jawBelowLip = registrations[model].anchors.lip[1] - registrations[model].anchors.jaw[1];
    expect(jawBelowLip).toBeGreaterThan(0);
    if (model === "male" || model === "female") expect(jawBelowLip).toBeGreaterThan(0.012);
    let targets = 0;
    for (const mesh of gltf.meshes) {
      expect((mesh.weights ?? []).every((v: number) => v === 0)).toBe(true);
      for (const primitive of mesh.primitives) {
        if (!mesh.extras?.targetNames?.length) {
          expect(mesh.name.toLowerCase()).toContain("ponytail");
          expect(primitive.attributes.TEXCOORD_0).toBeDefined();
          expect(
            gltf.materials[primitive.material].pbrMetallicRoughness
              .baseColorTexture.index,
          ).toBeGreaterThanOrEqual(0);
          continue;
        }
        const basis = gltf.accessors[primitive.attributes.POSITION];
        const positions = values(primitive.attributes.POSITION);
        if (model === "female") {
          const uv = gltf.accessors[primitive.attributes.TEXCOORD_0];
          expect(uv?.type).toBe("VEC2");
          const view = gltf.bufferViews[uv.bufferView];
          const coords = new Float32Array(
            binary.buffer,
            binary.byteOffset + (view.byteOffset ?? 0) + (uv.byteOffset ?? 0),
            uv.count * 2,
          );
          let minU = Infinity,
            maxU = -Infinity,
            minV = Infinity,
            maxV = -Infinity;
          for (let i = 0; i < uv.count; i++)
            if (
              Math.abs(positions[i * 3]) < 0.055 &&
              positions[i * 3 + 1] > 0.37 &&
              positions[i * 3 + 1] < 0.5 &&
              positions[i * 3 + 2] > 0.06
            ) {
              minU = Math.min(minU, coords[i * 2]);
              maxU = Math.max(maxU, coords[i * 2]);
              minV = Math.min(minV, coords[i * 2 + 1]);
              maxV = Math.max(maxV, coords[i * 2 + 1]);
            }
          expect(maxU - minU).toBeGreaterThan(0.08);
          expect(maxV - minV).toBeGreaterThan(0.2);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(positions, 3),
        );
        if (primitive.indices !== undefined) {
          const a = gltf.accessors[primitive.indices],
            v = gltf.bufferViews[a.bufferView];
          const offset =
            binary.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
          geometry.setIndex(
            new BufferAttribute(
              a.componentType === 5125
                ? new Uint32Array(binary.buffer, offset, a.count)
                : new Uint16Array(binary.buffer, offset, a.count),
              1,
            ),
          );
        }
        const tree = new MeshBVH(geometry, { indirect: true });
        for (const point of [
          ...Object.values(registrations[model].anchors),
          ...Object.values(registrations[model].contours).flat(),
        ]) {
          const hit = tree.closestPointToPoint(
            new Vector3(point[0], point[1], point[2]),
          );
          expect(hit?.distance).toBeLessThan(0.0001);
        }
        for (const feature of Object.keys(featureCatalog).filter(
          (f) => !["camera-distance", "brow-contrast"].includes(f),
        )) {
          const index = mesh.extras.targetNames.indexOf(feature + "-high");
          expect(index).toBeGreaterThanOrEqual(0);
          expect(
            values(primitive.targets[index].POSITION).some(
              (v) => Math.abs(v) > 0.00001,
            ),
          ).toBe(true);
        }
        geometry.dispose();
        const philtrumIndex = mesh.extras.targetNames.indexOf(
          "philtrum-length-high",
        );
        const philtrum = values(primitive.targets[philtrumIndex].POSITION),
          mouth = registrations[model].anchors.lip;
        let count = 0,
          min = Infinity,
          max = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
          if (
            Math.abs(positions[i]) < 0.025 &&
            Math.abs(positions[i + 1] - mouth[1]) < 0.006 &&
            positions[i + 2] > 0.085
          ) {
            count++;
            min = Math.min(min, philtrum[i + 1]);
            max = Math.max(max, philtrum[i + 1]);
          }
        }
        expect(count).toBeGreaterThan(10);
        expect(max - min).toBeLessThan(0.00001);
        let noseMotion = 0;
        for (let i = 0; i < positions.length; i += 3) {
          if (
            positions[i + 1] >=
              registrations[model].anchors.noseBase[1] - 0.000001 &&
            positions[i + 2] > 0.09
          )
            noseMotion = Math.max(noseMotion, Math.abs(philtrum[i + 1]));
        }
        expect(noseMotion).toBeLessThan(0.000001);
        for (const target of primitive.targets ?? []) {
          const a = gltf.accessors[target.POSITION];
          expect(a.count).toBe(basis.count);
          let max = 0;
          const data = values(target.POSITION);
          for (let i = 0; i < data.length; i += 3) {
            if (!Number.isFinite(data[i] + data[i + 1] + data[i + 2]))
              throw new Error("Non-finite morph position");
            max = Math.max(max, Math.hypot(data[i], data[i + 1], data[i + 2]));
          }
          expect(max).toBeLessThan(0.025);
          targets++;
        }
      }
    }
    expect(targets).toBeGreaterThanOrEqual(18);
  });
