import {
  sculptureSchema,
  sculptureCueConfiguration,
  sculptureNarrationGuides,
  sculptureStagedTreatment,
  sculptureUnderEar,
  type SculptureFeature,
  type SculptureStudy,
} from "./cephra-study";
import approved from "./cephra-approved-scripts.json";
import recordings from "./sculpture-recordings.json";
import { createVideoScript, type VideoScript } from "./video-script";
import type { VoiceDirection } from "./video-speech";

export type SculptureScript = {
  id: string;
  title: string;
  feature: SculptureFeature;
  categoryId: "mouth" | "jaw" | "overall" | "eyes" | "nose" | "cheeks";
  reportMetricId?: string;
  material?: SculptureStudy["material"];
  authored?: boolean;
  subjectId?: "zendaya" | "tom-holland";
  references?: Array<{ title: string; url: string; note: string }>;
  model: SculptureStudy["model"];
  voice: "Puck" | "Kore" | "Orus" | "Iapetus";
  delivery: string;
  cuts?: Partial<Record<30 | 45, string[]>>;
  sections: Array<{
    id?: string;
    study?: Partial<SculptureStudy>;
    variationMorph?: { from: number; to: number };
    role: "hook" | "locate" | "reveal" | "demonstrate" | "qualify" | "close";
    text: string;
    treatment: SculptureStudy["treatment"];
    camera: SculptureStudy["camera"];
    action: string;
  }>;
};

/** Original viewer-led explanations. Source mechanics inform choreography, never copied narration. */
export const legacySculptureScripts: SculptureScript[] = [
  {
    id: "mouth-in-context",
    title: "Full lips. Small-looking mouth.",
    feature: "philtrum-length",
    categoryId: "mouth",
    subjectId: "zendaya",
    model: "female",
    voice: "Kore",
    delivery:
      "Clear, friendly, curious and conversational. Speak directly to one viewer at about 195 words per minute. A connected explanation with nimble emphasis; no solemn narrator, artificial suspense or advertisement voice. Read exactly the supplied words. Mogging.com is pronounced Mogging dot com, with Mogging rhyming with dog.",
    sections: [
      {
        role: "hook",
        text: "Your lips can be full and still look small in your face.",
        treatment: "morph",
        camera: "hold",
        action:
          "Open on the complete face with a quick, subtle background acquisition. Hold neutral geometry. No A/B cards or feature-name spoiler.",
      },
      {
        role: "locate",
        text: "Before you blame their size, look at the space above them. The shape of the lips is only part of what you see.",
        treatment: "contour",
        camera: "hold",
        action:
          "Cursor locates nasal base and upper lip. Keep shape neutral, show a fine dotted local contour. Conceal the measurement name.",
      },
      {
        role: "reveal",
        text: "That space is your philtrum. Lengthen it slightly, and the same mouth sits lower in the face.",
        treatment: "datum",
        camera: "hold",
        action:
          "At philtrum, click the exact registered anchor; stagger extension lines, offset dashed dimension and endpoint ticks. Move the rigid mouth region down without changing lip volume.",
      },
      {
        role: "demonstrate",
        text: "Bring it back, and the mouth area feels more compact. The lips have not gained any volume. Their relationship to the nose has changed. So a bigger lip is not automatically a better fit.",
        treatment: "datum",
        camera: "pullback",
        action:
          "Reverse the same morph to neutral. Retain the registered bracket and animate the relative setting back. No unrelated nose or lip deformation.",
      },
      {
        role: "qualify",
        text: "If you want to see how your own mouth proportions score, go to Mogging.com.",
        treatment: "acquire",
        camera: "hold",
        action:
          "Transition into the populated Mouth feature grid and grow the philtrum metric card into focus.",
      },
      {
        role: "close",
        text: "Get your face analysis.",
        treatment: "acquire",
        camera: "hold",
        action:
          "Hold the full-screen Mouth report with real saved scores and graphics, and the centered app invitation. No empty score cards.",
      },
    ],
  },
  {
    id: "jaw-around-the-corner",
    title: "Why your jaw disappears on the turn.",
    feature: "gonial-angle",
    categoryId: "jaw",
    subjectId: "tom-holland",
    model: "male",
    voice: "Puck",
    delivery:
      "Upbeat, conversational and slightly playful, about 195 words per minute. Open as a real question to one viewer, then explain with clean changes in emphasis. Short pauses only when an observation lands. No hype, theatrical suspense or serious documentary cadence. Read exactly the supplied words. Mogging.com is pronounced Mogging dot com, with Mogging rhyming with dog.",
    sections: [
      {
        role: "hook",
        text: "Why does your jaw look sharp from the front, then almost disappear when you turn?",
        treatment: "morph",
        camera: "turn",
        action:
          "Start at three-quarter and make a genuine 3D turn toward profile. Keep all anatomy weights neutral so pose is not misrepresented as an edit.",
      },
      {
        role: "locate",
        text: "Look around the corner, just below your ear. A wide jaw does not tell you how steeply its lower edge meets the back.",
        treatment: "contour",
        camera: "hold",
        action:
          "Hold profile. Cursor finds the corrected surface gonion; dotted contour leads from the ear through the corner to the chin.",
      },
      {
        role: "reveal",
        text: "That meeting point makes the gonial angle. Open the angle, and the same lower face reads softer from the side.",
        treatment: "angle",
        camera: "hold",
        action:
          "At gonial angle, click. Reveal rear leg, lower leg and shortest angle arc in sequence, then the model-angle pill. Apply only bounded gonial morph.",
      },
      {
        role: "demonstrate",
        text: "Bring it back and follow the edge again. But keep your head level. Tilting your chin or changing the light can change that outline too. There is more to your jaw than one number.",
        treatment: "contour",
        camera: "hold",
        action:
          "Restore the exact neutral angle. Use staged geometric comparison without a golden-ratio grade. Preserve the same camera and light to isolate the anatomy demonstration.",
      },
      {
        role: "qualify",
        text: "To see how your jaw and chin score together, go to Mogging.com.",
        treatment: "acquire",
        camera: "hold",
        action:
          "Transition to the populated Jaw & chin feature grid, with the relevant metric card growing into focus.",
      },
      {
        role: "close",
        text: "Get your face analysis.",
        treatment: "acquire",
        camera: "hold",
        action:
          "Hold the full-screen Jaw & chin report and centered app invitation; keep the category score and native graphics visible.",
      },
    ],
  },
];

const philtrumStory = legacySculptureScripts.find(script => script.id === "mouth-in-context")!;
const philtrumStudies: Partial<Record<SculptureScript["sections"][number]["role"], Partial<SculptureStudy>>> = {
  hook: { showGuides: false },
  locate: {},
  reveal: { to: .48, instrument: "linear", showMeasurements: true },
  demonstrate: { from: .48 },
};

export const sculptureScripts: SculptureScript[] = [
  ...approved as SculptureScript[],
  {
    ...philtrumStory,
    authored: true,
    reportMetricId: "mouth.philtrum",
    cuts: { 30: ["hook", "reveal", "demonstrate", "qualify", "close"] },
    sections: philtrumStory.sections.map(section => ({
      ...section,
      study: { from: 0, to: 0, showMeasurements: false, instrument: "none", ...philtrumStudies[section.role] },
    })),
  },
];
export const sculptureScriptById = (id?: string) =>
  sculptureScripts.find(script => script.id === id) ?? legacySculptureScripts.find(script => script.id === id);
export const sculptureReportSection = (
  section: SculptureScript["sections"][number],
) => section.role === "qualify" || section.role === "close";

export type SculptureRecording = {
  audio: string;
  durationMs: number;
  cuts?: Partial<Record<30 | 45, string[]>>;
  sections: Array<{
    id?: string;
    study?: Partial<SculptureStudy>;
    startMs: number;
    durationMs: number;
    words: Array<{ text: string; startMs: number; endMs: number }>;
  }>;
};
export function sculptureRecording(
  script: SculptureScript,
): SculptureRecording | undefined {
  return (recordings as Record<string, SculptureRecording>)[script.id];
}
export function sculptureScriptDuration(script: SculptureScript) {
  return (
    sculptureRecording(script)?.durationMs ??
    script.sections.reduce(
      (sum, section) =>
        sum + Math.max(1800, section.text.split(/\s+/).length * 310),
      0,
    )
  );
}
type Treatment = SculptureStudy["treatment"];
const surfaceTreatments: readonly Treatment[] = [
  "contour",
  "section-scan",
  "region",
  "depth-plane",
  "surface-net",
  "inset",
  "card-merge",
  "datum",
  "mirror",
  "acquire",
];

/** Semantics constrain the experiment; they do not prescribe its editing technique. */
function sculptureTreatmentChoices(
  section: SculptureScript["sections"][number],
): readonly Treatment[] {
  const study = section.study;
  if (!study || sculptureReportSection(section)) return [section.treatment];
  if (study.reference)
    return [
      "research",
      "datum",
      "inset",
      "depth-plane",
      "section-scan",
      "card-merge",
      "acquire",
    ];
  if (study.feature === "camera-distance")
    return study.from !== study.to
      ? [
          "morph",
          "perspective",
          "comparison",
          "card-merge",
          "inset",
          "depth-plane",
          "section-scan",
          "surface-net",
          "datum",
          "region",
          "acquire",
          "mirror",
        ]
      : [
          "acquire",
          "thirds",
          "mirror",
          "inset",
          "contour",
          "surface-net",
          "depth-plane",
          "card-merge",
          "section-scan",
        ];
  if (study.lighting === "sweep")
    return [
      "contour",
      "section-scan",
      "region",
      "inset",
      "depth-plane",
      "surface-net",
      "card-merge",
      "acquire",
    ];
  if (study.view === "profile" && /\bprofile (?:angle|convexity)\b/i.test(section.text) &&
      /brow/i.test(section.text) && /nose/i.test(section.text) && /chin/i.test(section.text))
    return ["profile-chain","profile-offset","datum","inset"];
  if (study.feature === "mouth-width" && /surrounding proportions/i.test(section.text))
    return ["reference-ratio","inset","landmark-gauge","contour","region","morph"];
  if (study.feature === "brow-height" && /eye opening|eye height|height of (?:the|your) eyes?/i.test(section.text))
    return ["reference-ratio","landmark-gauge","inset","morph"];
  if (study.view === "profile" && study.feature === "chin-projection" &&
      /\bnose\b/i.test(section.text) && /\bchin\b/i.test(section.text))
    return ["profile-offset", "inset", "morph", "contour", "profile-plane", "depth-plane", "landmark-gauge", "card-merge", "section-scan"];
  if (study.feature === "cheek-height" && /\bcompare\b/i.test(section.text) && /\bjaw\b/i.test(section.text))
    return ["level-gauge", "landmark-gauge", "contour", "inset", "surface-net"];
  if (section.variationMorph)
    return study.feature === "gonial-angle"
      ? [
          "morph",
          "angle",
          "fold-ratio",
          "profile-plane",
          "comparison",
          "inset",
          "datum",
          "depth-plane",
          "contour",
          "section-scan",
          "card-merge",
        ]
      : [
          "morph",
          "comparison",
          "inset",
          "profile-plane",
          "datum",
          "section-scan",
          "region",
          "surface-net",
          "mirror",
          "card-merge",
          "depth-plane",
          "landmark-gauge",
        ];
  if (study.feature === "gonial-angle")
    return [
      "angle",
      "fold-ratio",
      "profile-plane",
      "inset",
      "datum",
      "depth-plane",
      "contour",
      "section-scan",
      "card-merge",
    ];
  if (study.view === "profile" && (study.feature === "midface-projection" || study.feature === "nose-projection"))
    return ["profile-offset", "profile-plane", "inset", "contour", "datum", "depth-plane"];
  if (/bone|muscle|masseter|layers/i.test(section.text))
    return [
      "bone-window",
      "layer-peel",
      "region",
      "section-scan",
      "inset",
      "depth-plane",
      "surface-net",
      "card-merge",
      "contour",
      "acquire",
      "mirror",
    ];
  if (study.from !== study.to)
    return [
      "landmark-gauge",
      "morph",
      "comparison",
      "mirror",
      "inset",
      "card-merge",
      "datum",
      "section-scan",
      "depth-plane",
      "region",
      "surface-net",
      "profile-plane",
    ];
  if (study.showGuides === false)
    return [
      "morph",
      "acquire",
      "thirds",
      "mirror",
      "inset",
      "card-merge",
      "contour",
      "surface-net",
      "region",
    ];
  if (/projection|prominent|side/i.test(section.text))
    return [
      "landmark-gauge",
      "profile-plane",
      "depth-plane",
      "inset",
      "card-merge",
      "contour",
      "datum",
      "section-scan",
      "surface-net",
      "region",
      "acquire",
      "mirror",
    ];
  if (study.feature && /\b(?:width|position|above|below|height|level|shorter|longer)\b/i.test(section.text))
    return ["landmark-gauge", ...surfaceTreatments];
  return surfaceTreatments;
}

/** Plan primary effects for the whole story, not an ornamental skin over fixed shots.
 * Each beat walks every compatible treatment with a different coprime stride.
 * Repeated effects and split comparisons are limited within each complete take. */
export function sculptureStoryTreatments(
  script: SculptureScript,
  variation: number,
): Treatment[] {
  const sequence: Treatment[] = [];
  const counts = new Map<Treatment, number>();
  const recording=sculptureRecording(script);
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  if (script.authored) return script.sections.map(section => section.treatment);
  for (const [index, section] of script.sections.entries()) {
    const clip=recording?.sections[index];
    const layerCue=clip&&section.study?.feature?sculptureNarrationGuides(
      {feature:section.study.feature,treatment:"layer-peel"},clip.words
    ).narrationTriggerMs:undefined;
    const choices = sculptureTreatmentChoices(section).filter(treatment=>
      treatment!=="layer-peel" || !clip || clip.durationMs-(layerCue??0)>=1300);
    let stride = index * 2 + 1;
    while (gcd(stride, choices.length) !== 1) stride++;
    const start = (Math.abs(variation) * stride + index * 7) % choices.length;
    let chosen = choices[start];
    for (let offset = 0; offset < choices.length; offset++) {
      const candidate = choices[(start + offset) % choices.length];
      if (
        candidate === sequence.at(-1) ||
        (counts.get(candidate) ?? 0) >= (candidate === "comparison" ? 1 : 2)
      )
        continue;
      chosen = candidate;
      break;
    }
    sequence.push(chosen);
    if (!sculptureReportSection(section))
      counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
  }
  return sequence;
}

function baseSculptureScriptStudy(
  script: SculptureScript,
  index: number,
  variation = 0,
): SculptureStudy {
  const section = script.sections[index],
    changed = 0.48;
  const underEar = sculptureUnderEar.test(section.text);
  const narrationTriggerMs = underEar
    ? sculptureRecording(script)?.sections[index]?.words?.find(word => /^ears?$/i.test(word.text))?.startMs
    : undefined;
  if (script.authored) {
    const study = section.study;
    const words = script.id === philtrumStory.id && section.role === "reveal"
      ? sculptureRecording(script)?.sections[index]?.words
      : undefined;
    const narrationTriggerMs = words?.find(word => /^philtrum$/i.test(word.text))?.startMs;
    const morphAt = words?.find(word => /^lengthen$/i.test(word.text))?.startMs;
    const variant = (variation + index) % 6;
    return sculptureSchema.parse({
      feature: script.feature, model: script.model, material: script.material ?? "matte",
      treatment: section.treatment, camera: section.camera, restore: false, variant,
      zoom: study?.profileGuide ? 1.17 : script.feature === "camera-distance" || study?.demo ? 1 : 1.04 + (variation % 3) * .04,
      ...study,
      ...(narrationTriggerMs === undefined ? {} : { narrationTriggerMs }),
      ...(morphAt === undefined ? {} : { guideEndMs: morphAt - 240 }),
    });
  }
  if (section.study) {
    const pick = <T>(values: readonly T[], salt: number): T => {
      let seed =
        Math.imul(variation + 1, 374761393) ^
        Math.imul(index + salt + 1, 668265263);
      seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
      return values[((seed ^ (seed >>> 16)) >>> 0) % values.length];
    };
    const experiment =
      section.study.feature === "camera-distance" ||
      section.study.lighting === "sweep";
    const measurement = section.study.showMeasurements === true;
    const treatment = sculptureStoryTreatments(script, variation)[index];
    const staged=sculptureStagedTreatment(treatment);
    const cues=section.study.feature
      ? sculptureNarrationGuides({feature:section.study.feature,treatment},sculptureRecording(script)?.sections[index]?.words??[])
      : {};
    const morph =
      treatment !== "layer-peel" && section.variationMorph &&
      (["morph", "comparison", "landmark-gauge", "profile-offset", "profile-plane", "depth-plane", "contour", "section-scan","reference-ratio","profile-chain"].includes(treatment) ||
        pick([true,false,false] as const, 57))
        ? {
            from: section.variationMorph.from,
            to: section.variationMorph.to * (variation % 2 ? -1 : 1),
            restore: true,
          }
        : undefined;
    // A spoken turn still turns. Perspective proofs keep their original lens and pose.
    const cameras =
      measurement ||
      section.study.view === "profile" ||
      section.treatment === "angle"
        ? (["hold", "push", "pullback", "pan"] as const)
        : (["hold", "push", "orbit", "pullback", "pan", "turn"] as const);
    const camera =
      staged ? (variation % 2 ? "push" : "hold") :
      experiment || section.camera === "turn"
        ? section.camera
        : cameras[(variation + index) % cameras.length];
    const accents = (
      ["none", "contour", "surface-net", "section-scan"] as const
    ).filter((value) => value !== treatment);
    const accent =
      section.study.showGuides === false ||
      experiment ||
      section.study.reference
        ? "none"
        : accents[(variation + index) % accents.length];
    const view =
      treatment === "profile-chain" ? "profile" : ["level-gauge","reference-ratio"].includes(treatment) ? "front" : experiment ||
      measurement ||
      section.study.view === "profile" ||
      section.camera === "turn"
        ? section.study.view
        : (["front", "three-quarter"] as const)[(variation + index) % 2];
    const instrument =
      measurement && section.study.instrument !== "linear"
        ? pick(["arc", "dial"] as const, 37)
        : section.study.instrument;
    return sculptureSchema.parse({
      model: script.model,
      feature: script.feature,
      restore: false,
      ...section.study,
      ...cues,
      ...(treatment==="layer-peel"?{from:0,to:0}:{}),
      ...(underEar ? { feature: "gonial-angle", narrationTriggerMs } : {}),
      ...morph,
      material: variation % 2 ? "reflective" : "matte",
      triggerMs: index === 0 ? 200 : pick([350, 500, 650, 800] as const, 41),
      variant: pick([0, 1, 2, 3, 4, 5] as const, 43),
      treatment,
      showGuides: treatment !== "morph" || section.study.showGuides !== false,
      camera,
      accent: staged ? "none" : accent,
      view,
      instrument,
      zoom: experiment
        ? 1
        : staged ? (variation % 2 ? 1.16 : 1.08)
        : ([0.92, 1.08, 1.22, 1, 1.16] as const)[(variation + index) % 5],
    });
  }
  const treatment: SculptureStudy["treatment"] =
    index === 1
      ? (
          [
            "contour",
            "region",
            "surface-net",
            "inset",
            "datum",
            "section-scan",
          ] as const
        )[variation % 6]
      : index === 3
        ? (script.feature === "gonial-angle"
            ? ([
                "contour",
                "angle",
                "depth-plane",
                "bone-window",
                "datum",
                "surface-net",
              ] as const)
            : ([
                "card-merge",
                "datum",
                "section-scan",
                "depth-plane",
                "inset",
                "contour",
              ] as const))[variation % 6]
        : section.treatment;
  return sculptureSchema.parse({
    model: script.model,
    feature: underEar ? "gonial-angle" : script.feature,
    narrationTriggerMs,
    treatment,
    material: variation % 3 === 2 ? "reflective" : "matte",
    camera:
      index === 1
        ? (["push", "hold", "pan"] as const)[variation % 3]
        : section.camera,
    from: index === 3 ? changed : 0,
    to: index === 2 ? changed : 0,
    showGuides: index >= 1,
    showMeasurements: index === 2 || index === 3,
    restore: false,
    triggerMs: index === 0 ? 200 : 650,
    accent: index === 3 && variation % 2 ? "contour" : "none",
    // Alternate the explanatory beat that owns the instrument, never both.
    // Other beats can retain a small surface-anchored value without a bottom rail.
    instrument:
      index === (variation % 2 ? 3 : 2) &&
      [
        "datum",
        "angle",
        "depth-plane",
        "thirds",
        "fold-ratio",
        "perspective",
      ].includes(treatment)
        ? script.feature === "gonial-angle" && variation % 3 !== 0
          ? "dial"
          : "auto"
        : "none",
    view:
      script.model === "male"
        ? index === 0
          ? "three-quarter"
          : "profile"
        : "front",
    variant: (index + variation) % 6,
  });
}
export function sculptureScriptStudy(script: SculptureScript, index: number, variation = 0): SculptureStudy {
  const study = baseSculptureScriptStudy(script, index, variation);
  const section = script.sections[index];
  if (sculptureReportSection(section)) return study;
  const clip = sculptureRecording(script)?.sections[index];
  return {
    ...study,
    ...sculptureCueConfiguration(study, section.text, variation, index, clip?.durationMs),
  };
}

export function sculptureScriptFrame(
  script: SculptureScript,
  time: number,
  variation = 0,
) {
  const recorded = sculptureRecording(script);
  let start = 0;
  const durations = script.sections.map(
    (section, i) =>
      recorded?.sections[i]?.durationMs ??
      Math.max(1800, section.text.split(/\s+/).length * 310),
  );
  const index = script.sections.findIndex((_, i) => {
    const end = start + durations[i];
    if (time < end || i === script.sections.length - 1) return true;
    start = end;
    return false;
  });
  let preceding = index - 1;
  if (sculptureReportSection(script.sections[index])) {
    while (preceding >= 0 && sculptureReportSection(script.sections[preceding]))
      preceding--;
  }
  const reportTime = sculptureReportSection(script.sections[index])
    ? time -
      durations
        .slice(0, preceding + 1)
        .reduce((sum, duration) => sum + duration, 0)
    : 0;
  const previous =
    preceding >= 0
      ? {
          study: sculptureScriptStudy(script, preceding, variation),
          time: durations[preceding],
          duration: durations[preceding],
        }
      : undefined;
  return {
    previous,
    reportTime,
    section: script.sections[index],
    index,
    time: time - start,
    duration: durations[index],
    study: sculptureScriptStudy(script, index, variation),
    report: sculptureReportSection(script.sections[index]),
    words: recorded?.sections[index]?.words,
  };
}

export function sculptureProductionScript(
  script: SculptureScript,
): VideoScript {
  const base = createVideoScript(
    script.sections.map((section) => ({
      id: section.id ?? section.role,
      narration: section.text,
      delivery: {
        direction: script.delivery.slice(0, 390),
        emphasis: [],
        paceWpm: 195,
        pauseAfterMs: 0,
      },
    })),
  );
  return {
    ...base,
    promotion: "contextual",
    references: script.references?.map((reference, index) => ({
      id: `source-${index}`,
      title: reference.title,
      url: reference.url,
      notes: reference.note,
      status: "notes-only" as const,
    })),
    cues: base.cues.map((cue, index) => ({
      ...cue,
      section: {
        id: cue.sourceId,
        title: script.sections[index].id ?? script.sections[index].role,
        role:
          index === 0
            ? "hook"
            : script.sections[index].role === "qualify"
              ? "cta"
              : script.sections[index].role === "close"
                ? "takeaway"
                : "explanation",
        priority: 100,
        dependsOn: index
          ? [script.sections[index - 1].id ?? script.sections[index - 1].role]
          : [],
        visuals: [
          {
            treatment: sculptureReportSection(script.sections[index])
              ? "report"
              : "measurement",
            categoryId: script.categoryId,
            view: script.model === "male" ? "profile" : "front",
            reason: script.sections[index].action.slice(0, 300),
          },
        ],
      },
    })),
  };
}
export function sculptureVoice(script: SculptureScript): VoiceDirection {
  return {
    preset: "editorial",
    voice: script.voice,
    direction: script.delivery,
  };
}
