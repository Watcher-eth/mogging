import { z } from 'zod'

// Reviewed primary sources. These findings do not validate an individual score.
export const creatorStudies = {
  'ward-2018': {
    authors: 'Ward et al.', year: 2018, journal: 'JAMA Facial Plastic Surgery',
    title: 'Camera distance and apparent nose size', doi: '10.1001/jamafacial.2018.0009',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29494735/',
    fullText: 'https://www.ohadf.com/papers/WardWardFriedPaskhover_JAMA2018.pdf',
    method: 'Mathematical projection model',
    claims: { 'camera-distance': 'Short camera distances can increase apparent nasal size in a projection model.' },
    limits: 'Model estimates depend on camera distance and assumed geometry. They are not calibrated measurements of this person.',
  },
  'mogilski-welling-2018': {
    authors: 'Mogilski & Welling', year: 2018, journal: 'Frontiers in Psychology',
    title: 'Brow and jaw shape in face ratings', doi: '10.3389/fpsyg.2018.02428',
    url: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02428/full',
    fullText: 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02428/full',
    method: 'Controlled composite faces · 922 participants',
    claims: { 'feature-salience': 'Brow thickness and jaw prominence were relatively salient in attractiveness ratings of manipulated composite faces.' },
    limits: 'Effects depended on task and context. This does not establish universal ideals, treatment benefits, or an individual rating.',
  },
} as const
export type CreatorStudyId = keyof typeof creatorStudies
export const studyBindingSchema = z.object({
  studyId: z.enum(['ward-2018', 'mogilski-welling-2018']), claimId: z.string().min(1).max(80),
  anchor: z.string().min(8).max(500),
}).strict().superRefine((binding, ctx) => {
  const fits=binding.studyId==='ward-2018'?/camera|distance|selfie|perspective/i.test(binding.anchor) && /nose|nasal/i.test(binding.anchor) && /size|larger|bigger|width|distort|proportion/i.test(binding.anchor):/brow|jaw/i.test(binding.anchor) && /thick|prominen|shape|structure/i.test(binding.anchor) && /attract|rating|percep|impression/i.test(binding.anchor)
  if(!fits || /\d(?:\.\d+)?\s*(?:\/\s*10|out of (?:ten|10))|\b(?:always|guarantees?|universal ideal)\b/i.test(binding.anchor))ctx.addIssue({code:'custom',message:'Anchor the supported research finding, never an individual score or universal ideal.'})
  if (!Object.hasOwn(creatorStudies[binding.studyId].claims,binding.claimId)) ctx.addIssue({ code: 'custom', message: 'The study must support this curated claim.' })
})
export type StudyBinding = z.infer<typeof studyBindingSchema>
export const scientificWritingBrief = {
  policy: 'Aim for 1–2 relevant primary-source cards when a claim warrants them. Citations, author names and study provenance are visual metadata only: never insert them into the voiceover. Use section.evidence [{studyId,claimId,anchor}], where anchor is an exact relevant phrase in that section. Do not attach a paper merely because it mentions the same feature. Do not claim that a study validates a Mogging score or a universal ideal. Omit a citation when no verified claim fits.',
  studies: Object.entries(creatorStudies).map(([id, study]) => ({ id, claims: study.claims, limits: study.limits })),
}
