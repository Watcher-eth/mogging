import cephraReferences from "./cephra-references.json";
import { z } from "zod";

import featureCatalog from "./sculpture-features.json";
export const sculptureAssetVersion = "20261106-baked-studio";
export const sculptureFeatures = [
  "jaw-width",
  "chin-projection",
  "cheek-height",
  "nose-projection",
  "philtrum-length",
  "eye-tilt",
  "midface-projection",
  "gonial-angle",
  "lip-fullness",
  "brow-contrast",
  "camera-distance",
  "chin-height",
  "chin-width",
  "nose-width",
  "nose-tip",
  "nose-bridge",
  "mouth-width",
  "upper-lip",
  "lower-lip",
  "brow-height",
  "brow-arch",
  "brow-ridge",
  "forehead-projection",
  "forehead-slope",
  "jaw-taper",
  "jaw-height",
  "cheek-projection",
] as const;
export const sculptureFeatureConfig = featureCatalog;
export type SculptureFeature = (typeof sculptureFeatures)[number];
export const sculptureTreatments = [
  "morph",
  "datum",
  "angle",
  "thirds",
  "profile-plane",
  "comparison",
  "bone-window",
  "region",
  "perspective",
  "acquire",
  "material",
  "fold-ratio",
  "inset",
  "card-merge",
  "mirror",
  "research",
  "surface-net",
  "section-scan",
  "contour",
  "depth-plane",
  "landmark-gauge",
  "profile-offset",
  "level-gauge",
  "profile-chain",
  "reference-ratio",
  "layer-peel",
] as const;
export const sculptureModels = [
  "female", "male", "classical", "textured", "swept", "editorial-female", "editorial-male",
] as const;
export const sculptureMaterials = ["matte", "reflective", "chrome"] as const;
export type SculptureModel = (typeof sculptureModels)[number];
export type SculptureMaterial = (typeof sculptureMaterials)[number];

export const studioSculptureModels = [
  "female", "male", "editorial-female", "editorial-male",
] as const satisfies readonly SculptureModel[];

export const sculptureModelLabels: Record<SculptureModel, string> = {
  female: "Female sculpture",
  male: "Male sculpture",
  classical: "Classical curls",
  textured: "Textured crop",
  swept: "Swept-back waves",
  "editorial-female": "Swept-back braid",
  "editorial-male": "Short swept crop",
};

export const sculptureMaterialLabels: Record<SculptureMaterial, string> = {
  matte: "Honed concrete",
  reflective: "Satin white lacquer",
  chrome: "Polished silver chrome",
};

export function sculptureFinishes(model: SculptureModel): readonly SculptureMaterial[] {
  return model === "classical" ? sculptureMaterials : sculptureMaterials.slice(0, 2);
}

export const sculptureEditorialEffects = [
  "datum-drop", "offset-bridge", "cupid-fork", "length-transfer",
  "eye-level-reference", "tilt-wedge", "cheek-coordinate", "width-transfer",
  "hinge-lock", "arc-envelope", "cutaway-edge", "focal-reticle",
  "perspective-frustum", "matched-crops", "rolling-comparison", "support-lattice",
] as const;

type Effect = (typeof sculptureEditorialEffects)[number];

export function sculptureEditorialForCue(
  study: Pick<SculptureStudy, "feature" | "demo" | "treatment" | "from" | "to" | "view" | "showGuides">,
  text: string,
  variation: number,
  durationMs?: number,
): Effect | undefined {
  const { feature, demo, treatment, from, to } = study;
  if (study.showGuides === false || /^(arch|bite|crowding|smile)$/.test(demo ?? "")) return;
  if (/research|material|card-merge|comparison/.test(treatment)) return;
  const changing = Math.abs(from - to) > .05;
  let choices: readonly Effect[];
  if (demo === "lens-detail") return; // The authored detail cards already occupy this shot.
  if (feature === "camera-distance") choices = ["perspective-frustum", "focal-reticle", "matched-crops", "rolling-comparison"];
  else if (feature === "eye-tilt") choices = ["eye-level-reference", "tilt-wedge"];
  else if (feature === "gonial-angle") choices = /bone-window|layer-peel/.test(treatment) && /bone|skin|tissue/i.test(text)
    ? ["cutaway-edge", "hinge-lock"] : ["hinge-lock", "arc-envelope"];
  else if (feature === "philtrum-length") choices = ["cupid-fork", "length-transfer"];
  else if (/cheek/.test(feature)) choices = ["cheek-coordinate", "width-transfer", "support-lattice"];
  else if (/projection|slope/.test(feature)) choices = ["datum-drop", "offset-bridge", "support-lattice"];
  else if (/width|taper/.test(feature)) choices = ["focal-reticle", "width-transfer"];
  else choices = ["focal-reticle", "length-transfer"];
  if (changing && !demo && treatment === "morph") choices = [...choices, "matched-crops", "rolling-comparison"];
  const eligible = choices.filter(effect => {
    if (effect === "cupid-fork" && study.view === "profile") return false;
    if (effect === "width-transfer" && study.view === "profile") return false;
    if (effect === "matched-crops" || effect === "rolling-comparison")
      return (changing || demo === "lens-mirror") && (durationMs === undefined || durationMs >= 2000);
    return true;
  });
  if (/\b(?:compare|before|after|same face|same nose|different profile)\b/i.test(text)) {
    eligible.sort((a,b) => Number(b.includes("comparison") || b === "matched-crops") - Number(a.includes("comparison") || a === "matched-crops"));
  }
  return eligible[Math.abs(variation) % (eligible.length + 1)];
}

export const sculptureBackgrounds = [
  "none", "tracking-frame", "checker", "mesh", "draft-grid",
  "dot-field", "depth-grid", "interference", "studio-halo",
] as const;

export function sculptureBackgroundForCue(variation: number, cue: number) {
  return sculptureBackgrounds[(Math.abs(variation) * 4 + cue * 5) % sculptureBackgrounds.length];
}

/** One policy for Studio stories, the script preview and generated narration. */
export function sculptureCueConfiguration(
  study: Pick<SculptureStudy, "feature" | "demo" | "treatment" | "from" | "to" | "view" | "showGuides" | "profileGuide" | "anglePhase" | "morphReturnMs" | "guideEndMs" | "lighting">,
  text: string,
  variation: number,
  cue: number,
  durationMs?: number,
): Pick<SculptureStudy, "background" | "editorial" | "morphCurve"> {
  const seed = Math.abs(variation) + cue * 7;
  const dental = /^(arch|bite|crowding|smile)$/.test(study.demo ?? "");
  const lighting = study.lighting === "sweep";
  const backgrounds: readonly SculptureStudy["background"][] = dental || lighting
    ? ["none", "studio-halo", "mesh"]
    : sculptureBackgrounds;
  const preferred = dental || lighting ? "studio-halo"
    : study.feature === "camera-distance" ? "depth-grid"
    : study.view === "profile" ? "draft-grid"
    : /\b(?:surface|shadow|light)\b/i.test(text) ? "mesh"
    : /\b(?:points?|landmarks?)\b/i.test(text) ? "dot-field"
    : "none";
  const phase = backgrounds.findIndex(background => background === preferred);
  const background = backgrounds[(Math.abs(variation) * 4 + cue * 5 + phase) % backgrounds.length];
  const editorial = lighting ? undefined : sculptureEditorialForCue(study, text, seed, durationMs);
  const editable = !study.demo && !study.profileGuide && !study.anglePhase &&
    study.morphReturnMs === undefined && study.guideEndMs === undefined &&
    Math.abs(study.to - study.from) > .05 &&
    /^(morph|datum|region|landmark-gauge)$/.test(study.treatment);
  const morphCurve = editable ? ([undefined, "two-stage", "recoil"] as const)[seed % 3] : undefined;
  return { background, editorial, morphCurve };
}

export const sculptureSchema = z
  .object({
    feature: z.enum(sculptureFeatures),
    treatment: z.enum(sculptureTreatments).default("morph"),
    model: z.enum(sculptureModels).default("female"),
    material: z.enum(sculptureMaterials).default("matte"),
    camera: z
      .enum(["hold", "push", "orbit", "pullback", "turn", "pan"])
      .default("hold"),
    accent: z
      .enum(["none", "surface-net", "contour", "section-scan"])
      .default("none"),
    background: z.enum(sculptureBackgrounds).default("none"),
    editorial: z.enum(sculptureEditorialEffects).optional(),
    instrument: z
      .enum(["none", "auto", "linear", "arc", "dial"])
      .default("auto"),
    zoom: z.number().min(0.85).max(1.25).default(1),
    lighting: z.enum(["fixed", "sweep"]).default("fixed"),
    reference: z
      .object({
        title: z.string().max(100),
        detail: z.string().max(140),
        url: z.string().url(),
      })
      .optional(),
    triggerMs: z.number().min(200).max(5000).default(650),
    narrationTriggerMs: z.number().nonnegative().optional(),
    guideEndMs: z.number().nonnegative().optional(),
    guideMiddleMs: z.number().nonnegative().optional(),
    guideConnectMs: z.number().nonnegative().optional(),
    demo: z.enum(["eye-dots", "eye-line", "eye-tilt", "eye-level", "lens-detail", "lens-mirror", "arch", "bite", "crowding", "smile"]).optional(),
    profileGuide: z.enum(["datum", "offset", "persist"]).optional(),
    anglePhase: z.enum(["guides", "bone"]).optional(),
    morphCurve: z.enum(["two-stage", "recoil"]).optional(),
    morphReturnMs: z.number().nonnegative().optional(),
    restore: z.boolean().default(true),
    showGuides: z.boolean().default(true),
    showMeasurements: z.boolean().default(true),
    revealRegion: z
      .enum(["feature", "cheek", "jaw", "nose"])
      .default("feature"),
    from: z.number().min(-1).max(1).default(-0.55),
    to: z.number().min(-1).max(1).default(0.55),
    view: z.enum(["front", "three-quarter", "profile"]).default("front"),
    variant: z.number().int().min(0).max(5).default(0),
  })
  .strict()
  .refine(({model, material}) => sculptureFinishes(model).includes(material), {path:["material"],message:"This finish is unavailable for the selected sculpture."});
export type SculptureStudy = z.infer<typeof sculptureSchema>;
/** A sandbox take explores the entire registered library, rather than just reversing a morph. */
export function sculpturePrimitiveVariation(
  study: SculptureStudy,
  variation: number,
): SculptureStudy {
  const seed = Math.abs(variation);
  const feature = sculptureFeatures[seed % sculptureFeatures.length];
  const treatment =
    sculptureTreatments[(seed * 7) % sculptureTreatments.length];
  const side = /jaw|chin|gonial|nose|midface|forehead/.test(feature);
  const model = sculptureModels[seed % sculptureModels.length];
  const finishes = sculptureFinishes(model);
  return sculptureSchema.parse({
    ...study,
    feature,
    treatment: treatment === "profile-offset" && !side ? "landmark-gauge" : treatment,
    ...(treatment === "level-gauge" || treatment === "layer-peel" ? {feature:"cheek-height" as const} : {}),
    ...(treatment === "profile-chain" ? {feature:"chin-projection" as const} : {}),
    ...(treatment === "reference-ratio" ? {feature:"brow-height" as const} : {}),
    model,
    material: finishes[Math.floor(seed / sculptureModels.length) % finishes.length],
    camera: (["push", "orbit", "pan", "pullback", "turn", "hold"] as const)[
      seed % 6
    ],
    view:
      treatment === "profile-chain" ? "profile" : ["level-gauge","reference-ratio"].includes(treatment) ? "front" : ["angle", "profile-plane", "fold-ratio", "profile-offset"].includes(treatment) && side
        ? "profile"
        : (["front", "three-quarter", "profile"] as const)[seed % 3],
    background: sculptureBackgroundForCue(seed, 0),
    editorial: sculptureEditorialEffects[seed % sculptureEditorialEffects.length],
    accent: (["section-scan", "surface-net", "contour", "none"] as const)[
      seed % 4
    ],
    instrument: (["none", "linear", "arc", "dial"] as const)[
      Math.floor(seed / 3) % 4
    ],
    showGuides: true,
    showMeasurements: true,
    variant: seed % 6,
    zoom: [1, 1.12, 0.94, 1.2][seed % 4],
    from: 0,
    to: seed % 2 ? 0.45 : -0.45,
    restore: true,
  });
}
export function sculptureRegion(feature: SculptureFeature) {
  if (/jaw|gonial/.test(feature)) return "jaw";
  if (/chin/.test(feature)) return "chin";
  if (/nose|midface|camera/.test(feature)) return "nose";
  if (/lip|mouth|philtrum/.test(feature)) return "mouth";
  if (/brow|forehead/.test(feature)) return "brow";
  if (/eye/.test(feature)) return "eye";
  return "cheek";
}
/** Each construction uses named points on the active morphing surface. */
export function sculptureAnglePoints(
  feature: SculptureFeature,
): [string, string, string] {
  if (feature === "gonial-angle") return ["ear", "jawHinge", "chin"];
  switch (sculptureRegion(feature)) {
    case "jaw":
      return ["ear", "jaw", "chin"];
    case "chin":
      return ["jaw", "chin", "lowerLip"];
    case "nose":
      return ["glabella", "nose", "noseBase"];
    case "mouth":
      return ["mouthLeft", "upperLip", "mouthRight"];
    case "brow":
      return ["forehead", "brow", "glabella"];
    case "eye":
      return ["eyeLeft", "noseBase", "eyeRight"];
    default:
      return ["eyeRight", "cheek", "mouthRight"];
  }
}
/** Bone windows cover anatomical regions, independently of the smaller edit handle. */
export function sculptureCutawaySurface(study: SculptureStudy) {
  const region =
    study.revealRegion === "feature"
      ? sculptureRegion(study.feature)
      : study.revealRegion;
  return {
    contour: `cutaway-${region}`,
    anchor: `cutaway${region[0].toUpperCase()}${region.slice(1)}`,
  };
}
/** The mask and its outline must use the same opening/closing geometry. */
export function sculptureWindowContour<T extends { x: number; y: number }>(
  contour: readonly T[],
  center: { x: number; y: number },
  progress: number,
): T[] {
  const scale = Math.max(0, Math.min(1, progress));
  return contour.map((point) => ({
    ...point,
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  }));
}
export const sculptureTiming = {
  acquireMs: 650,
  morphMs: 1750,
  holdMs: 900,
  restoreMs: 1500,
  legMs: 420,
  arcDelayMs: 460,
  arcMs: 380,
} as const;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
export const sculptureEase = (t: number) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const sculptureLayerTreatment = (treatment?: SculptureStudy["treatment"]) =>
  treatment === "bone-window" || treatment === "layer-peel";
export function sculptureLayerMotion(time: number, duration: number, clickAt: number, reduced = false) {
  const length = Math.max(500, duration - clickAt);
  if(reduced)return {reveal:1,separate:1};
  const reveal=Math.min(430,length*.29), hinge=Math.min(490,length*.34);
  return {
    reveal:sculptureEase((time-clickAt)/reveal),
    separate:sculptureEase((time-clickAt-hinge)/Math.min(650,length*.36)),
  };
}

export function sculptureLayerEdge(contour:readonly {y:number}[], progress:number){
  const ys=contour.map(point=>point.y);
  const first=Math.min(...ys);
  return first+(Math.max(...ys)-first)*progress;
}

export const sculptureStagedTreatment=(treatment:SculptureStudy["treatment"])=>
  ["landmark-gauge","profile-offset","level-gauge","profile-chain","reference-ratio","layer-peel"].includes(treatment);

export function sculptureGuideAnchors(study: Pick<SculptureStudy, "feature" | "treatment">): readonly string[] {
  if (study.treatment === "profile-chain") return ["glabella","noseBase","chin"];
  if (study.treatment === "reference-ratio") return study.feature === "mouth-width" ?
    ["mouthLeft","mouthRight","noseLeft","noseRight"] : ["eyeRight","brow","lidTop","lidBottom"];
  if (study.treatment === "level-gauge") return ["cheek", "jaw"];
  if (study.treatment === "profile-offset" && study.feature === "chin-projection")
    return ["chin", "nose"];
  return sculptureFeatureConfig[study.feature].measure;
}

const spokenLandmarks: Record<string, RegExp> = {
  noseBase: /^(?:base|nose)$/i,
  nose: /^(?:nose|tip)$/i,
  glabella: /^(?:brows?|eyebrows?|glabella|browbone)$/i,
  brow: /^(?:brows?|eyebrows?)$/i,
  mouthLeft: /^(?:mouth|lips?)$/i,
  noseLeft: /^(?:nose|surrounding|proportions)$/i,
  upperLip: /^(?:lips?|cupid|peaks?)$/i,
  lowerLip: /^lips?$/i,
  chin: /^chin$/i,
  jaw: /^jaw(?:line)?$/i,
  cheek: /^cheek(?:bone)?s?$/i,
  eyeLeft: /^(?:eye|pupil)s?$/i,
  eyeRight: /^(?:eye|pupil)s?$/i,
};

export function sculptureNarrationGuides(
  study:Pick<SculptureStudy,"feature"|"treatment">,
  words:readonly {text:string;startMs:number}[],
): Pick<SculptureStudy,"narrationTriggerMs"|"guideMiddleMs"|"guideEndMs"|"guideConnectMs"> {
  if (!sculptureStagedTreatment(study.treatment) || !words.length) return {};
  const at=(pattern:RegExp|undefined,from=0)=>words.find(word=>
    word.startMs>=from && pattern?.test(word.text.replace(/[^a-z-]/gi,""))
  )?.startMs;
  const {treatment}=study;
  if(treatment==="layer-peel"){
    return {narrationTriggerMs:at(/^(?:bones?|cheekbones?|skull)$/i)??at(/^(?:masseter|muscle)$/i)};
  }
  const guide=sculptureGuideAnchors(study);
  const chain=treatment==="profile-chain",ratio=treatment==="reference-ratio";
  const onset=at(spokenLandmarks[guide[0]]);
  const middle=chain?at(spokenLandmarks[guide[1]],(onset??0)+180):undefined;
  const end=ratio?at(guide[0]==="mouthLeft"?spokenLandmarks.noseLeft:/^(?:compare|opening|height)$/i,(onset??0)+200):
    at(spokenLandmarks[guide[chain?2:1]],(middle??onset??0)+180);
  const connect=chain?at(/^(?:connect|angle|relationship)$/i,(end??0)+110):undefined;
  return {narrationTriggerMs:onset,guideMiddleMs:middle,guideEndMs:end,guideConnectMs:connect};
}

export function sculptureTargetAnchor(study: SculptureStudy) {
  if (["landmark-gauge", "profile-offset", "level-gauge","profile-chain","reference-ratio"].includes(study.treatment))
    return sculptureGuideAnchors(study)[0];
  return sculptureLayerTreatment(study.treatment) ||
    (["inset", "card-merge"].includes(study.treatment) && study.revealRegion !== "feature")
    ? sculptureCutawaySurface(study).anchor
    : study.feature === "gonial-angle"
      ? sculptureAnglePoints(study.feature)[1]
      : sculptureFeatureConfig[study.feature].anchor;
}

/** Place a feature crop beside its actual anchor, inside the feed-safe content area. */
export function sculptureInsetFrame(
  target: { x: number; y: number },
  width: number,
  height: number,
  instrument = false,
) {
  const size = width * (instrument ? 0.22 : 0.25),
    gap = width * 0.035;
  const bottom = height * (instrument ? 0.7 : 0.85);
  const clampTo = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  return {
    x: clampTo(target.x + gap, width * 0.08, width * 0.81 - size),
    y: clampTo(target.y + gap, height * 0.25, bottom - size),
    width: size,
    height: size,
  };
}

/** Orbit around the face-and-neck mass, rather than the model's sculpting origin. */
export function sculptureFrameCenter(
  points: Record<string, readonly number[]>,
) {
  return {
    x: (points.eyeLeft[0] + points.eyeRight[0]) / 2,
    z: ((points.forehead[2] + points.chin[2] + points.noseBase[2]) / 3) * 0.85,
  };
}
export type SculpturePrevious = {
  study: SculptureStudy;
  time: number;
  duration: number;
};
export function sculptureHandoff(
  time: number,
  duration: number,
  reduced = false,
) {
  return reduced ? 1 : sculptureEase(time / Math.min(1100, duration * 0.4));
}
/** The scale reveals first; its physical indicator then travels independently. */
export function sculptureInstrumentMotion(age: number, reduced = false) {
  return {
    entry: reduced ? 1 : sculptureEase((age - 180) / 420),
    rail: reduced ? 1 : sculptureEase((age - 300) / 600),
    marker: reduced ? 1 : sculptureEase((age - 760) / 1000),
    markerOpacity: reduced ? 1 : sculptureEase((age - 650) / 200),
  };
}
export function sculptureSample(
  study: SculptureStudy,
  time: number,
  duration: number,
  reduced = false,
) {
  const acquire = study.narrationTriggerMs === undefined
      ? Math.max(200, Math.min(study.triggerMs, duration * 0.12))
      : Math.min(study.narrationTriggerMs, Math.max(0, duration - 1)),
    changeAt = study.guideEndMs === undefined || study.morphReturnMs !== undefined || study.demo === "eye-tilt" ? acquire :
      Math.max(acquire, Math.min((study.guideConnectMs ?? study.guideEndMs) + 240, duration)),
    forward = Math.max(1, Math.min(sculptureTiming.morphMs, duration * 0.28, duration - changeAt)),
    restoreAt = Math.max(
      changeAt + forward + Math.min(900, duration * 0.13),
      duration * 0.7,
    ),
    restore = Math.min(sculptureTiming.restoreMs, duration - restoreAt);
  const phase = clamp((time - changeAt) / forward);
  const sweep = study.morphCurve === "two-stage"
    ? .62 * sculptureEase(phase / .4) + .38 * sculptureEase((phase - .48) / .52)
    : study.morphCurve === "recoil"
      ? sculptureEase(phase / .76) + .075 * Math.sin(Math.PI * clamp((phase - .6) / .4))
      : sculptureEase(phase);
  const progress = reduced
    ? 0.5
    : Math.min(sweep, Math.abs(study.to) > .92 ? 1 : 1.075) *
      (study.morphReturnMs !== undefined
        ? 1 - sculptureEase((time - study.morphReturnMs) / forward)
        : study.restore
        ? 1 - sculptureEase((time - restoreAt) / Math.max(1, restore))
        : 1);
  const value = study.demo === "eye-tilt" && !reduced
    ? study.from * sculptureEase((time - acquire) / 340) *
      (1 - sculptureEase((time - (study.guideEndMs ?? acquire + 700)) / 420)) +
      study.to * sculptureEase((time - (study.guideConnectMs ?? acquire + 1400)) / 450)
    : study.from + (study.to - study.from) * progress;
  return {
    value,
    progress,
    clickAt: acquire,
    effectMs: Math.max(0, time - acquire),
    baseline: study.from,
  };
}
export const sculptureLabels = Object.fromEntries(
  Object.entries(featureCatalog).map(([key, value]) => [key, value.label]),
) as Record<SculptureFeature, string>;
export const sculptureUnderEar = /\b(?:below|under|beneath)\s+(?:(?:the|your|his|her|their|an)\s+)?ears?\b/i;
export function sculptureFeatureForText(text: string): SculptureFeature {
  if (sculptureUnderEar.test(text) || /gonial|jaw angle|corner of the jaw/i.test(text)) return "gonial-angle";
  if (/camera|selfie|lens|distance/i.test(text)) return "camera-distance";
  if (/philtrum|below the nose|(?:space|gap) (?:between|above) .{0,30}(?:upper lip|nose)/i.test(text)) return "philtrum-length";
  if (/forehead/i.test(text)) return "forehead-slope";
  if (/brow.*arch/i.test(text)) return "brow-arch";
  if (/brow.*height|higher brows/i.test(text)) return "brow-height";
  if (/nose.*width|wider nose/i.test(text)) return "nose-width";
  if (/mouth.*width|wider mouth/i.test(text)) return "mouth-width";
  if (/chin.*(?:width|wide|narrow)/i.test(text)) return "chin-width";
  if (/chin.*(?:height|tall|short)/i.test(text)) return "chin-height";
  if (/chin/i.test(text)) return "chin-projection";
  if (/cheek/i.test(text)) return "cheek-height";
  if (/maxilla|midface/i.test(text)) return "midface-projection";
  if (/nose.*tip|nasal tip/i.test(text)) return "nose-tip";
  if (/nasal bridge|nose.*bridge/i.test(text)) return "nose-bridge";
  if (/nose/i.test(text)) return "nose-projection";
  if (/brow/i.test(text)) return "brow-contrast";
  if (/eye|canthal/i.test(text)) return "eye-tilt";
  if (/upper lip/i.test(text)) return "upper-lip";
  if (/lower lip/i.test(text)) return "lower-lip";
  if (/lip|mouth/i.test(text)) return "lip-fullness";
  return "jaw-width";
}
/** The shared brief is a reusable contract, not permission to reuse another creator's words. */
export const cephraWritingBrief = {
  referenceBreakdowns: cephraReferences.references,
  cueMatching: [
    "Name the visual relationship in the sentence that introduces it. For example, distinguish philtrum length from lip fullness and jaw angle from jaw width.",
    "Comparison cues should identify what changes and what stays fixed. Explicitly distinguish camera, lighting and anatomical changes.",
    "Stage a baseline, landmark construction, controlled change and return on separate beats when the explanation needs them. Give the report its own closing beat.",
  ],
  hookFormats: [
    {
      id: "viewer-check",
      opening:
        "A specific question about something the viewer notices in their own face, with its visible demonstration already beginning.",
      arc: "Personal observation → locate the relationship → construct the relevant measurement → change one variable and restore it → explain the limit → populated matching-category report and invitation.",
    },
    {
      id: "relationship-reversal",
      opening:
        "Address the viewer directly with a concrete counterintuitive observation: the feature can be prominent while its surrounding relationship changes the impression.",
      arc: "Unexpected observation → inspect the surrounding space → name the relationship → show the controlled change → useful qualification → category-specific app report.",
    },
    {
      id: "concealed-variable",
      opening:
        "Immediate matched-face choice; keep the changed feature and its ruler hidden.",
      arc: "Unchanged features → a clue → name the variable around the midpoint → controlled demonstration → exact baseline → contextual invitation.",
    },
    {
      id: "no-anatomy-edit",
      opening: "An apparent feature change without an anatomy edit.",
      arc: "Show the mismatch → isolate unchanged geometry → reveal camera distance near the midpoint → perspective demonstration with matched framing → invitation.",
    },
  ],
  references: [
    ["7704787816353467680", "philtrum"],
    ["7703892730501467424", "jaw-angle"],
    ["7703220453979983137", "perspective"],
    ["7701884172238998816", "brow-contrast"],
    ["7702054345977777440", "cheek-height"],
    ["7704300623637810465", "midface"],
    ["7705508293069851937", "profile-chain"],
    ["7705142571089136928", "reference-ratio"],
    ["7704351931384270112", "layer-peel"],
  ],
  length:
    "Default full narration: 180–230 words, roughly 55–70 seconds at an energetic conversational pace. Shorter cuts preserve the setup and payoff rather than truncating the ending.",
  structure: [
    "A source-backed surprise, a revealing visual, or a specific viewer-facing observation",
    "Restore the baseline",
    "Locate the named feature with a staged construction",
    "Connect two to four related facial facts; each individual experiment still changes only one variable",
    "Hold the result and introduce the important qualification",
    "Pull back and close with a feature-specific Mogging.com invitation",
  ],
  language: [
    "Never say look at this model, on this model, or narrate editing instructions. Address the viewer; let the visuals explain the mechanism while the voice shares interesting knowledge.",
    "Build a coherent explanation across related features, perspective, anatomy or light. Do not stretch one small manipulation into the whole video, and do not turn every sentence into an instruction.",
    "Cite primary sources for factual claims and preserve their limits. Distinguish a geometric prediction, an anatomical fact and a subjective visual impression.",
    "Vary whole-face views, feature crops, depth/anatomy windows, source cards and native instruments. Each section needs its own visual purpose, with phrase-level entrances and transitions. Avoid using the same treatment in every section or stacking all effects together.",
    "Use a timeline or dial only for a narrated dimension, angle or controlled change; leave the hook, anatomy explanations and visual observations free of instruments. Prefer a small anchored value pill when sufficient. Never place instruments in consecutive beats. Enter the readout, sweep the ticks, then settle the marker after the cursor click; retain clean holds between effects.",
    "Speak to one viewer using you and your. Make the opening useful and specific. Do not default to choosing between A/B faces or announcing that an edit happened. Vary question, observation and practical-check hooks.",
    "Close the spoken invitation on the populated native feature grid. Grow the script-relevant metric card into focus. Keep example-data provenance in internal metadata, outside the rendered UI.",
    "For mystery hooks, conceal the answer in both narration and graphics until the middle. An early feature label, ruler or revealing close-up can spoil the hook even when the script does not.",
    "Make the opening change visible within the first second. Use short, conversational observations and varied delivery; avoid a slow technical primer.",

    "Use a concise observation, then a concrete explanation. Avoid universal beauty ideals, diagnoses, invented personal scores and unsupported millimetre ranges.",
    "On staged measurements, place the first point when it is named, add the second point on its cue, then draw the interval. For a profile relationship, hold the camera and use a plumb line; for relative cheek and jaw width, use the front view and build the guides in sequence.",
  "For a three-point profile example, name the marks in order, let each land, then draw the two legs and show the relationship. A relative gauge builds the target span and the reference span separately. A layer illustration can reveal a local section and then separate it into a card while the untouched surface stays visible.",
  "A simulated morph is an illustration, not a treatment result or an assessment of a real person.",
    "Keep each short section self-contained with its feature, source, baseline and reveal dependency; never move a payoff before its setup.",
    "Write the exact phrase, variable, protected anatomy, cursor trigger, construction legs, morph, reading hold and reset together. Existing recordings must remain unchanged until new scripts are reviewed.",
  ],
  design: {
    palette: "Neutral grays, off-white sculpture on white; no cyan or blue.",
    surface:
      "Porous fine concrete or polished satin-white lacquer with broad soft reflections, never metallic silver. A bright neutral studio key, a subtle cool-white fill, a separate rim and low-intensity physical surround; no literal blue tint.",
    motion:
      "One continuous mesh with bounded anatomical shape keys. Cursor release owns the morph clock. Independent caption, camera, guide and readout clocks.",
    readouts:
      "Large readable native rulers and dials beside the left-hand readout; restrained gray ticks on white. Light face guides on matte stone and darker guides on satin lacquer. Relative controls and genuine source-bound scores stay separate.",
    render:
      "Use the same studio lights, Blender-baked contact shading, and soft shadows throughout preview and export. Neck and shoulders stay under an eased progressive blur into white; never expose a hard lower render edge.",
  },
} as const;

import type { VideoScene } from "./video-composition";

/** Preserve photographed evidence and scores. Sculptures explain a named variable; they never impersonate the subject. */
export function planSculptureScenes(
  scenes: VideoScene[],
  subject: string,
  variation: number,
): VideoScene[] {
  const groups = new Map<string, number>();
  const instruments = new Map<string, boolean>();
  return scenes.map((scene) => {
    if (scene.sculpture) return scene;
    const cue = scene.scriptRange?.cueId ?? scene.cueId;
    const text = scenes
      .filter((s) => (s.scriptRange?.cueId ?? s.cueId) === cue)
      .map((s) => s.narration)
      .join(" ");
    if (
      scene.source.kind !== "portrait" ||
      scene.scoreCallouts?.length ||
      /mogging\.com|get your face analysis|\b(?:scores?|rated|rating)\b/i.test(
        text,
      ) ||
      !/jaw|chin|cheek|nose|philtrum|eye|brow|forehead|lip|mouth|midface|ear|camera distance|lens/i.test(
        text,
      )
    )
      return scene;
    const profileChain = /\b(?:profile convexity|profile angle)\b/i.test(text) &&
      /\bchin\b/i.test(text) && /\bnose\b/i.test(text) && /\bbrow/i.test(text);
    const browRatio = /\bbrows?\b/i.test(text) && /\b(?:eye opening|eye height|height of (?:the|your) eyes?)\b/i.test(text);
    const feature = profileChain ? "chin-projection" : browRatio ? "brow-height" : sculptureFeatureForText(text),
      group = `${scene.scriptRange?.cueId ?? scene.cueId}:${feature}`;
    if (!groups.has(group)) groups.set(group, groups.size);
    const variant = (variation + groups.get(group)!) % 6;
    const treatments: Partial<
      Record<SculptureFeature, readonly SculptureStudy["treatment"][]>
    > = {
      "gonial-angle": [
        "angle",
        "fold-ratio",
        "comparison",
        "inset",
        "angle",
        "morph",
      ],
      "cheek-height": ["landmark-gauge", "region", "thirds", "inset", "morph", "contour"],
      "brow-contrast": [
        "card-merge",
        "datum",
        "inset",
        "comparison",
        "morph",
        "research",
      ],
      "philtrum-length": [
        "landmark-gauge",
        "thirds",
        "inset",
        "comparison",
        "morph",
        "card-merge",
      ],
      "midface-projection": [
        "profile-offset",
        "region",
        "comparison",
        "inset",
        "morph",
        "profile-plane",
      ],
      "camera-distance": [
        "perspective",
        "inset",
        "mirror",
        "card-merge",
        "perspective",
        "datum",
      ],
    };
    const baseTreatment: SculptureStudy["treatment"] =
      /reflectiv|roughness|material|matte/i.test(text)
        ? "material"
        : (treatments[feature] ?? [
            "comparison",
            "datum",
            "region",
            "morph",
            "inset",
            "card-merge",
          ])[variant];

    const boneCue =
      /\bskull\b|bone beneath|beneath the skin|under the skin/i.test(text);
    const treatment = profileChain ? "profile-chain" : browRatio ? "reference-ratio" :
      boneCue && /jaw|gonial|chin|cheek|nose|midface/.test(feature)
        ? variant%2 ? "layer-peel" : "bone-window"
        : variant === 5
          ? (["surface-net", "section-scan", "depth-plane"] as const)[
              Math.floor(variation / 6) % 3
            ]
          : baseTreatment;
    const viewChange = /turn|pose|camera angle|head angle/i.test(text);
    const protectedAppearance = /expression|smil|light|shadow/i.test(text);
    const changing =
      !viewChange &&
      !protectedAppearance &&
      /widen|narrow|shorten|lengthen|fuller|thinner|higher|lower|bring.+forward|move.+(?:up|down)|change.+(?:shape|size|length|width)/i.test(
        text,
      );
    // One decision per narration cue, shared by all of its caption fragments.
    if (!instruments.has(cue)) {
      const previous = [...instruments.values()].at(-1) ?? false;
      instruments.set(
        cue,
        !previous &&
          !viewChange &&
          !protectedAppearance &&
          /angle|degrees?|ratio|width|length|distance|measure/i.test(text) &&
          [
            "datum",
            "angle",
            "thirds",
            "perspective",
            "fold-ratio",
            "depth-plane",
          ].includes(treatment) &&
          variant % 3 !== 1,
      );
    }
    const geometry = { feature, treatment, from: 0, to: changing ? (variant % 2 ? -0.45 : 0.45) : 0 };
    const sculpture = sculptureSchema.parse({
      ...geometry,
      accent:
        variant === 3 ? "surface-net" : variant === 4 ? "contour" : "none",
      instrument: instruments.get(cue)
        ? /angle|tilt|slope|rotation/.test(feature) && variant % 2 === 0
          ? "dial"
          : "auto"
        : "none",
      model: /zendaya/i.test(subject) ? "female" : "male",
      material: variant % 3 === 0 ? "reflective" : "matte",
      camera: viewChange ? "orbit" : variant % 3 === 0 ? "push" : "hold",
      view:
        treatment === "reference-ratio" ? "front" : treatment === "profile-chain" ? "profile" : feature === "gonial-angle" ||
        feature === "midface-projection" ||
        ["angle", "fold-ratio", "profile-plane", "profile-offset"].includes(treatment)
          ? "profile"
          : variant % 2
            ? "front"
            : "three-quarter",
      variant,
    });
    return {
      ...scene,
      sculpture: {
        ...sculpture,
        ...sculptureCueConfiguration(sculpture, text, variation, groups.get(group)!),
      },
      captionScale: 0.88,
      source: { ...scene.source, overlay: "none" },
      presentation: undefined,
      featureStudy: undefined,
      photoStudy: undefined,
      profileStudy: undefined,
      study: undefined,
      portraitProgram: undefined,
      portraitFX: undefined,
      tracks: scene.tracks.filter((t) => t.target === "text"),
    };
  });
}

/** Caption splits retain the same morph and cursor clock. A different variable starts a new experiment. */
export function sculptureSceneClock(
  scenes: VideoScene[],
  scene: VideoScene,
  localMs: number,
) {
  const index = scenes.indexOf(scene),
    key = (s: VideoScene) =>
      s.sculpture ? JSON.stringify([s.cueId, s.sculpture]) : "";
  let first = index,
    last = index;
  while (first > 0 && key(scenes[first - 1]) === key(scene)) first--;
  while (last + 1 < scenes.length && key(scenes[last + 1]) === key(scene))
    last++;
  return {
    startIndex: first,
    time: scene.startMs - scenes[first].startMs + localMs,
    duration:
      scenes[last].startMs + scenes[last].durationMs - scenes[first].startMs,
  };
}

const resolvedSculptureGuides=new WeakMap<VideoScene,SculptureStudy>()
export function sculptureWithRecordedGuides(scenes:VideoScene[],startIndex:number,duration:number){
  const first=scenes[startIndex],study=first.sculpture!
  if(!sculptureStagedTreatment(study.treatment))return study
  const cached=resolvedSculptureGuides.get(first)
  if(cached)return cached
  const words=[]
  for(let i=startIndex;i<scenes.length && scenes[i].startMs<first.startMs+duration;i++){
    const scene=scenes[i]
    for(const word of scene.words??[])words.push({text:word.text,startMs:scene.startMs-first.startMs+word.startMs})
  }
  const cues=sculptureNarrationGuides(study,words)
  const resolved={...study,
    narrationTriggerMs:study.narrationTriggerMs??cues.narrationTriggerMs,
    guideMiddleMs:study.guideMiddleMs??cues.guideMiddleMs,
    guideEndMs:study.guideEndMs??cues.guideEndMs,
    guideConnectMs:study.guideConnectMs??cues.guideConnectMs,
  }
  resolvedSculptureGuides.set(first,resolved)
  return resolved
}
