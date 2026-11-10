// Web port of the mobile onboarding sequence and copy.
export type OnboardingProfileStepId = "dating" | "motivation" | "relevance" | "agency" | "transformation" | "goals" | "obstacle" | "experience" | "methods" | "evidence" | "age" | "gender" | "time" | "commit";

export type MobileOnboardingProgress = {
  step: OnboardingProfileStepId
  answers: Partial<Record<OnboardingProfileStepId, string[]>>
}

export const initialMobileOnboarding: MobileOnboardingProgress = { step: 'dating', answers: {} }

export function getOnboardingProfileSteps(experience: unknown, variant: "full" | "short" = "full"): OnboardingProfileStepId[] {
  const hasExperience = experience === "tried" || experience === "active";
  const steps: OnboardingProfileStepId[] = ["dating", "motivation", "relevance", "agency", "transformation", "goals", "obstacle", "experience", ...(hasExperience ? ["methods" as const] : []), "evidence", "age", "gender", "time", "commit"];
  return variant === "short" ? steps.filter(step => !["obstacle", "experience", "methods", "time"].includes(step)) : steps;
}

export const motivations = [
  { id: 'confidence', label: 'Feel more confident', icon: 'sparkles' },
  { id: 'dating', label: 'Improve my dating life', icon: 'heart' },
  { id: 'direction', label: 'Know what to improve', icon: 'scope' },
  { id: 'routine', label: 'Build a routine that works', icon: 'checklist' },
  { id: 'photos', label: 'Look better in photos', icon: 'camera' },
  { id: 'social', label: 'Improve my social life', icon: 'person.2' },
] as const;

export const obstacles = [
  { id: 'starting', label: 'I don’t know where to start', icon: 'scope' },
  { id: 'advice', label: 'The advice is confusing', icon: 'text.bubble' },
  { id: 'consistency', label: 'I start strong, then stop', icon: 'arrow.trianglehead.clockwise' },
  { id: 'progress', label: 'I can’t see my progress', icon: 'chart.xyaxis.line' },
  { id: 'time', label: 'Life gets in the way', icon: 'clock' },
] as const;

export const relevanceCopy: Record<string, { title: string; body: string }> = {
  photos: { title: 'Feel good about\nbeing in the photo.', body: 'Build a look you feel ready to put in the frame.' },
  social: { title: 'Put yourself\nout there.', body: 'Feel ready for new faces, new conversations, and new possibilities.' },
  confidence: { title: 'Show up as\nyour best self.', body: 'Less second-guessing. A clear starting point to build on.' },
  dating: { title: 'Make your first\nimpression count.', body: 'Build a look you feel confident putting forward.' },
  direction: { title: 'Stop guessing.\nStart with you.', body: 'Find your strengths. Know where to focus next.' },
  routine: { title: 'Turn intention\ninto a routine.', body: 'Small steps that fit your life, with a reason behind each one.' },
};

export const storyHeadings: Partial<Record<string, { eyebrow?: string; title: string; body: string }>> = {
  motivation: { title: 'What would make\nthe biggest difference?', body: 'Choose what matters most to you.' },
  obstacle: { title: 'What usually\ngets in the way?', body: 'No wrong answers. Pick the one that fits.' },
  agency: { title: 'You didn’t choose\nyour genetics.', body: 'Your habits are a different story.' },
  transformation: { title: 'Your starting point\nisn’t your limit.', body: 'Skin care. Grooming. Better habits. Build on what’s yours.' },
  evidence: { title: 'Backed by experts.\nDesigned for you.', body: '' },
  commit: { title: 'Your next chapter\nstarts with day one.', body: 'Your goals. Your routine. Ascend in the next 60 days and achieve your true potential.' },
  goals: { eyebrow: 'YOUR FOCUS', title: 'What do you want\nto work on?', body: 'Choose everything that matters to you.' },
  experience: { eyebrow: 'YOUR STARTING POINT', title: 'Your experience', body: 'No judgment. Everyone starts somewhere.' },
  methods: { eyebrow: 'YOUR EXPERIENCE', title: 'What have\nyou tried?', body: 'These are past experiences, not recommendations. Choose all that apply.' },
  age: { eyebrow: 'A LITTLE ABOUT YOU', title: 'How old are you?', body: 'Your age helps us tailor appropriate guidance.' },
  gender: { eyebrow: 'YOUR APPEARANCE PROFILE', title: 'Your profile', body: 'Choose the profile that fits you.' },
  time: { eyebrow: 'MAKE IT FIT YOUR LIFE', title: 'Your daily routine', body: 'Choose a daily routine you can realistically come back to.' },
};
export type OnboardingChoice = { id: string; label: string };

// Labels are the original persisted aliases. Keep them stable; localized display
// text will be resolved separately so language never changes a saved choice.
export const onboardingChoices = {
  gender: [{ id: 'male', label: 'Man' }, { id: 'female', label: 'Woman' }, { id: 'other', label: 'Other' }],
  experience: [
    { id: 'starting', label: 'I’m just starting' }, { id: 'tried', label: 'I’ve tried a few things' },
    { id: 'active', label: 'I’m actively improving' },
  ],
  methods: [
    { id: 'exercise', label: 'Exercise' }, { id: 'mewing', label: 'Mewing' }, { id: 'skin-care', label: 'Skin care' },
    { id: 'injectables', label: 'Fillers / Botox' }, { id: 'surgery', label: 'Surgery' }, { id: 'bone-smashing', label: 'Bone smashing' },
    { id: 'diets', label: 'Diets' }, { id: 'peptides', label: 'Peptides' }, { id: 'other', label: 'Other' },
  ],
  goals: [
    { id: 'jaw', label: 'A sharper jawline' }, { id: 'skin-age', label: 'Clearer, healthier skin' },
    { id: 'symmetry', label: 'Better facial harmony' }, { id: 'eyes', label: 'Stronger eye area' },
    { id: 'facial-fat', label: 'Facial Weight Loss / Debloat' }, { id: 'hair', label: 'Hair' },
    { id: 'eyebrows', label: 'Eyebrows' }, { id: 'nose', label: 'Nose' }, { id: 'lips', label: 'Lips' },
    { id: 'cheekbones', label: 'Cheekbones' }, { id: 'overall', label: 'Overall Looks Improvement' },
  ],
  commitment: [
    { id: 'minutes-5', label: '5 minutes a day' }, { id: 'minutes-15', label: '15 minutes a day' },
    { id: 'flexible', label: 'Whatever it takes' },
  ],
} satisfies Record<string, OnboardingChoice[]>;

