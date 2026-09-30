// Task copy, focus ranking, and calendar scheduling mirror
// mogging-mobile/src/screens/reports-screen.tsx (2026-09-30).
import { reportCategories } from './mobile-overlay-engine/report-data'

export const protocolFocusAreas = reportCategories.map(category => ({ id: category.id, label: category.id === 'jaw' ? 'Jawline' : category.title }))
export const protocolSize = { width: 390, height: 844 }
export type MockProtocolDay = { date: string; label: string; dayNumber: number; items: RoutineItem[] }

export type RoutineItem = {
  id: string;
  title: string;
  detail: string;
  tips?: string[];
  cadence: string;
  dayOffset: number;
  time: "Morning" | "Midday" | "Evening" | "Anytime";
  hour?: number;
  durationHours?: number;
  priority?: number;
  icon: { ios: string; android: string };
  color: string;
  action?: "new-scan" | "uv-scan" | "open-report";
};

type LooksmaxingTaskTemplate = {
  key: string;
  title: string;
  detail: string;
  tips: string[];
  cadence: string;
  time: RoutineItem["time"];
  hour: number;
  durationHours?: number;
  icon: { ios: string; android: string };
  color: string;
  priority: number;
  focusIds?: string[];
};

function getLooksmaxingTaskTemplates({
  focusIds,
  needsExercise,
  needsSkinRecovery,
  needsUvCare,
  reportSummary,
  uvIndex,
}: {
  focusIds: Set<string>;
  needsExercise: boolean;
  needsSkinRecovery: boolean;
  needsUvCare: boolean;
  reportSummary: string | null;
  uvIndex: number;
}): LooksmaxingTaskTemplate[] {
  const templates: LooksmaxingTaskTemplate[] = [
    {
      key: "neck-posture",
      title: focusIds.has("jaw") || focusIds.has("facial-fat") ? "Sharpen lower third" : "10 chin tucks",
      detail: focusIds.has("jaw") || focusIds.has("facial-fat") ? "Do 10 slow chin tucks, then hold a tall neck for 30 sec to reduce under-chin collapse." : "Do 10 slow chin tucks with ears stacked over shoulders.",
      tips: ["Move the chin straight back, not down.", "Keep teeth unclenched so the jawline stays relaxed.", "Stop if neck motion causes pain or dizziness."],
      cadence: "Posture",
      time: "Morning",
      hour: 7,
      icon: { ios: "figure.stand", android: "accessibility_new" },
      color: "#32c48d",
      priority: needsExercise ? 92 : 70,
      focusIds: ["jaw", "facial-fat", "face-shape"],
    },
    {
      key: "shoulder-frame",
      title: "Posture decompression",
      detail: "Run wall angels, doorway pec stretch, and band pull-aparts so shoulders sit back/down and your neck-to-shoulder line reads wider.",
      tips: ["Keep ribs down; do not arch your lower back.", "Pull shoulders down and back, not up toward ears.", "Aim for a cleaner visual stance, not max effort."],
      cadence: "Frame",
      time: "Midday",
      hour: 13,
      icon: { ios: "figure.strengthtraining.traditional", android: "fitness_center" },
      color: "#26b86b",
      priority: focusIds.has("dimorphism") || focusIds.has("face-shape") ? 88 : 62,
      focusIds: ["dimorphism", "face-shape", "overall"],
    },
    {
      key: "targeted-shoulders",
      title: "Targeted shoulder width",
      detail: "Train lateral delts, rear delts, upper back, and traps to build a broader frame around the face.",
      tips: ["Use lateral raises for width and rear-delt flyes for 3D shape.", "Add rows or face pulls so posture supports the shoulder line.", "Keep traps controlled; the goal is width, not a hunched neck."],
      cadence: "Hypertrophy",
      time: "Evening",
      hour: 18,
      durationHours: 1.2,
      icon: { ios: "figure.strengthtraining.traditional", android: "fitness_center" },
      color: "#159a5b",
      priority: focusIds.has("dimorphism") || focusIds.has("face-shape") || focusIds.has("overall") ? 94 : 60,
      focusIds: ["dimorphism", "face-shape", "overall"],
    },
    {
      key: "skin-barrier",
      title: needsSkinRecovery ? "Calm skin barrier" : "Clean skin reset",
      detail: needsSkinRecovery ? "Cleanse gently, moisturize, and skip acids/scrubs so redness and texture can settle." : "Wash face and apply a light moisturizer so texture reads smoother.",
      tips: ["Use lukewarm water; hot water makes redness louder.", "Skip new actives if skin feels tight or irritated.", "Wait a few minutes after moisturizer so shine settles."],
      cadence: "Skin",
      time: "Morning",
      hour: 8,
      icon: { ios: "drop.fill", android: "water_drop" },
      color: "#48c7ff",
      priority: needsSkinRecovery ? 94 : 72,
      focusIds: ["skin-age", "sun-damage"],
    },
    {
      key: "uv-spf",
      title: needsUvCare ? "Block UV damage" : "SPF face + neck",
      detail: needsUvCare ? `UV ${uvIndex || "-"} today: apply SPF to face/neck and use shade to protect tone and skin-age score.` : "Apply SPF before outdoor time so tone stays easier to compare.",
      tips: ["Cover forehead, nose, cheeks, ears, and neck.", "Use shade or a hat when UV is high.", "Do not judge redness right after direct sun."],
      cadence: "UV",
      time: "Morning",
      hour: 9,
      icon: { ios: "sun.max.fill", android: "wb_sunny" },
      color: "#f5b73f",
      priority: needsUvCare ? 96 : 66,
      focusIds: ["sun-damage", "skin-age"],
    },
    {
      key: "water-minerals",
      title: "Debloat with water + potassium foods",
      detail: "Drink 500 ml water and add a potassium-rich food like potato, banana, spinach, yogurt, or coconut water if your diet has been salty.",
      tips: ["Use food first; do not start potassium pills or salt substitutes casually.", "Keep sodium and water steady so face fullness is easier to compare.", "Do not slam water late at night if puffiness is a focus."],
      cadence: "Hydration",
      time: "Midday",
      hour: 11,
      icon: { ios: "drop.degreesign.fill", android: "water_drop" },
      color: "#2eafff",
      priority: focusIds.has("skin-age") || focusIds.has("facial-fat") ? 84 : 68,
      focusIds: ["skin-age", "facial-fat", "eyes"],
    },
    {
      key: "nasal-slimming",
      title: "Nasal slimming check",
      detail: "Reduce temporary nose puffiness before judging width: steady water, lower late-night sodium/alcohol, and clear congestion.",
      tips: ["Keep photos straight-on; angled light can make the nose read wider.", "Matte the T-zone so shine does not widen the bridge/tip.", "Use hair/brow grooming to frame the midface cleaner."],
      cadence: "Nose",
      time: "Morning",
      hour: 10,
      icon: { ios: "nose.fill", android: "air" },
      color: "#00a8ef",
      priority: focusIds.has("nose") ? 94 : 48,
      focusIds: ["nose", "symmetry", "overall"],
    },
    {
      key: "eye-depuff",
      title: focusIds.has("eyes") ? "Depuff eye area" : "Cold rinse eyes",
      detail: focusIds.has("eyes") ? "Cold rinse for 30 sec, hydrate, and avoid overhead light so the eye area looks cleaner." : "Cold rinse for 30 sec and hydrate before judging tiredness.",
      tips: ["Use cool water, not ice directly on skin.", "Avoid squinting; it makes eye-area tension look worse.", "Compare after waking puffiness has settled."],
      cadence: "Eyes",
      time: "Morning",
      hour: 10,
      icon: { ios: "eye.fill", android: "visibility" },
      color: "#8c7cff",
      priority: focusIds.has("eyes") ? 90 : 54,
      focusIds: ["eyes", "skin-age"],
    },
    {
      key: "hair-frame",
      title: focusIds.has("face-shape") ? "Frame face with hair" : "Style hair off eyes",
      detail: focusIds.has("face-shape") ? "Style hair to show temples and face outline; bad framing can make face shape score look worse." : "Keep hair off eyes and temples so your features read cleaner.",
      tips: ["Keep both eyes visible.", "Avoid flattening volume if it narrows your face.", "Use the same style for future comparisons."],
      cadence: "Hair",
      time: "Midday",
      hour: 14,
      icon: { ios: "scissors", android: "content_cut" },
      color: "#111113",
      priority: focusIds.has("face-shape") || focusIds.has("dimorphism") ? 88 : 58,
      focusIds: ["face-shape", "dimorphism", "overall"],
    },
    {
      key: "lip-mouth",
      title: focusIds.has("mouth") ? "Clean mouth line" : "Apply lip balm",
      detail: focusIds.has("mouth") ? "Use balm and relax your lips so mouth line, width, and dental display read cleaner." : "Use a light balm and keep your mouth relaxed.",
      tips: ["Do not press lips together.", "Avoid forced smiling in comparison photos.", "Keep jaw unclenched so the mouth line stays neutral."],
      cadence: "Mouth",
      time: "Midday",
      hour: 12,
      icon: { ios: "mouth.fill", android: "mood" },
      color: "#ff6f9f",
      priority: focusIds.has("mouth") ? 90 : 52,
      focusIds: ["mouth"],
    },
    {
      key: "myofunctional-control",
      title: "Myofunctional control",
      detail: "Practice tongue posture, nasal breathing, and relaxed lip seal so the lower face looks less tense and more supported.",
      tips: ["Rest the full tongue gently on the palate; do not press hard.", "Keep teeth slightly apart and lips closed without clenching.", "Breathe through the nose if clear; stop if it causes jaw, tongue, or airway discomfort."],
      cadence: "Oral posture",
      time: "Evening",
      hour: 20,
      durationHours: 0.5,
      icon: { ios: "mouth.fill", android: "mood" },
      color: "#ff8a66",
      priority: focusIds.has("jaw") || focusIds.has("mouth") || focusIds.has("facial-fat") ? 91 : 58,
      focusIds: ["jaw", "mouth", "facial-fat", "overall"],
    },
    {
      key: "grooming-contrast",
      title: focusIds.has("dimorphism") ? "Boost feature contrast" : "Clean grooming edges",
      detail: reportSummary ? `${reportSummary}: tidy brows, hairline, and shine so structure reads sharper.` : "Tidy brows/hairline and reduce shine so features read sharper.",
      tips: ["Clean stray hairs; do not over-trim into a new shape.", "Control shine without filters or heavy makeup.", "Keep grooming consistent before reports."],
      cadence: "Presentation",
      time: "Midday",
      hour: 15,
      icon: { ios: "sparkles", android: "auto_awesome" },
      color: "#ef5da8",
      priority: focusIds.has("overall") || focusIds.has("dimorphism") ? 86 : 64,
      focusIds: ["overall", "dimorphism", "jaw"],
    },
  ];

  return templates.sort((a, b) => getTemplateFocusScore(b, focusIds) - getTemplateFocusScore(a, focusIds) || b.priority - a.priority);
}

function getTemplateFocusScore(template: LooksmaxingTaskTemplate, focusIds: Set<string>) {
  const focusScore = template.focusIds?.some((id) => focusIds.has(id)) ? 100 : 0;
  return focusScore + template.priority;
}

function pickLooksmaxingTemplatesForDay(templates: LooksmaxingTaskTemplate[], dayOffset: number, targetCount: number) {
  const picked: LooksmaxingTaskTemplate[] = [];
  const start = Math.abs(dayOffset * 3) % Math.max(1, templates.length);

  for (let step = 0; step < templates.length && picked.length < targetCount; step += 1) {
    const template = templates[(start + step) % templates.length];
    if (picked.some((item) => item.key === template.key)) continue;
    picked.push(template);
  }

  return picked;
}

function getLooksmaxingTimeForIndex(index: number): RoutineItem["time"] {
  if (index === 0) return "Morning";
  if (index === 1 || index === 2) return "Midday";
  return "Evening";
}

function getRoutineItemHour(item: RoutineItem) {
  if (typeof item.hour === "number") return clampRoutineHour(item.hour);
  if (item.time === "Morning") return 8;
  if (item.time === "Midday") return 12;
  if (item.time === "Evening") return 16;
  return 14;
}

export function getScheduledRoutineItems(items: RoutineItem[], startHour: number) {
  const sorted = [...items].sort((a, b) => getRoutineItemHour(a) - getRoutineItemHour(b) || getRoutineItemPriority(b) - getRoutineItemPriority(a));
  const slots = getRoutineScheduleSlots(sorted.length);

  return sorted.map((item, index) => {
    const hour = Math.max(startHour, slots[index] ?? 16);
    const nextHour = slots[index + 1] ?? 19;
    const durationHours = Math.min(1.35, Math.max(0.78, nextHour - hour - 0.18));
    return { item, hour, durationHours };
  });
}

function getRoutineScheduleSlots(count: number) {
  if (count <= 1) return [10];
  if (count === 2) return [7, 16];
  if (count === 3) return [7, 12, 16];
  return [7, 10, 13, 16];
}

function getRoutineItemPriority(item: RoutineItem) {
  if (typeof item.priority === "number") return item.priority;
  if (item.action === "new-scan" || item.action === "uv-scan") return 90;
  if (item.action === "open-report") return 74;
  return 40;
}

function clampRoutineHour(hour: number) {
  return Math.max(7, Math.min(16, Math.round(hour)));
}


export function buildMockProtocol(focusId: string, startDate: string): MockProtocolDay[] {
  if (!protocolFocusAreas.some(area => area.id === focusId)) throw new Error('Choose a protocol focus area')
  const start = new Date(`${startDate}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || localDate(start) !== startDate) throw new Error('Choose a valid start date')
  const templates = getLooksmaxingTaskTemplates({ focusIds: new Set([focusId]), needsExercise: ['jaw', 'dimorphism', 'facial-fat'].includes(focusId), needsSkinRecovery: focusId === 'skin-age', needsUvCare: focusId === 'sun-damage', reportSummary: null, uvIndex: 0 })
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    // Preserve the mobile rotation and task-count pattern while keeping the
    // selected focus represented every day of this single-area mock.
    const count = [2, 3, 2, 3, 2, 4, 3][offset]
    const rotated = pickLooksmaxingTemplatesForDay(templates, offset, count)
    const primary = templates[0]
    const selected = [primary, ...rotated.filter(task => task.key !== primary.key)].slice(0, count)
    const items = selected.map((task, index) => ({ ...task, id: `looks-${task.key}-p${offset}`, dayOffset: offset, time: getLooksmaxingTimeForIndex(index), hour: clampRoutineHour(task.hour + index % 2) }))
    return { date: localDate(date), label: offset === 0 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()], dayNumber: date.getDate(), items }
  })
}

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
