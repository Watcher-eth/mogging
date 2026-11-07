import {productionCut} from './video-production'
import {spokenScoreCallouts} from './spoken-score'
import {expect,test} from 'bun:test'
import {editorialRatingReports,editorialRatingInput,followerScript,streamedFollowerText} from './private-character'

test('streamed prose exposes only actual generated text across partial JSON strings and escapes',()=>{
  expect(streamedFollowerText('{"title":"Hidden metadata","sections":[{"feature":"jaw","text":"Look at the jaw')).toBe('Look at the jaw')
  expect(streamedFollowerText('{"sections":[{"text":"A \\"clean\\" outline."},{"text":"Next, the eyes\\n')).toBe('A "clean" outline.\n\nNext, the eyes\n')
  expect(streamedFollowerText('{"sections":[{"feature":"eyes"}')).toBe('')
})
test('follower stories preserve distinct narration and choose contextual endings without inserting generic CTAs',()=>{
  const paragraphs=[
    'The jaw gets your attention. But the story starts one feature higher.',
    'Those wide cheekbones set the frame, then let the lower face taper beneath them.',
    'The jaw scores 7.5 out of ten on Mogging, and its outline explains why.',
    'The brows sit close to the eyes, bringing the attention back toward the center.',
    'Notice how those strong edges surround softer lips. The contrast keeps this face balanced.',
    'That balance is the part Mogging helps you see: the whole face carries the impression.'
  ]
  const script=followerScript(paragraphs.map((text,i)=>({text,feature:i===2?'jaw':'overall'})))
  expect(script.cues.map(cue=>cue.text)).toEqual(paragraphs)
  expect(script.cues[0].section?.role).toBe('hook')
  expect(script.cues.at(-1)?.section?.role).toBe('takeaway')
  expect(script.cues.some(cue=>cue.section?.role==='cta')).toBe(false)
  expect(script.cues.every(cue=>cue.section?.visuals.length)).toBe(true)
})


test('literal out-of-ten scores accept varied narration and reject unsupported score values',()=>{
  const reports=[{id:'jaw',title:'Jaw & chin',score:7.5,features:[]}] as unknown as Parameters<typeof spokenScoreCallouts>[1]
  expect(spokenScoreCallouts('Mogging rates his jaw 7.5 out of ten.',reports,'jaw')?.map(score=>score.value)).toEqual([7.5])
  expect(spokenScoreCallouts('His jaw earns 7.5 out of ten on Mogging.',reports,'jaw')?.map(score=>score.value)).toEqual([7.5])
  expect(spokenScoreCallouts('Mogging rates his jaw 8 out of ten.',reports,'jaw')).toBeUndefined()
})


test('a complete five-beat story keeps its payoff instead of rejecting an arbitrary section count',()=>{
  const rows=[
    'The jaw gets your attention. But this face has another anchor.',
    'Watch how the cheekbones set the width above the lower face.',
    'Mogging rates his jaw 7.5 out of ten, with a clear taper beneath the cheeks.',
    'The brows bring the attention back toward the middle of the face.',
    'That connection is what Mogging helps you spot: the frame works as a whole.'
  ]
  const script=followerScript(rows.map(text=>({feature:'jaw',text})))
  expect(script.cues).toHaveLength(5)
  expect(script.cues.at(-1)?.section?.role).toBe('takeaway')
  expect(productionCut(script,60).cues.map(cue=>cue.text)).toEqual(script.cues.map(cue=>cue.text))
})


test('editorial ratings expose only approved grades without inheriting provider or potential scores',()=>{
 const ratings=[{feature:'brows',score:8},{feature:'jaw',score:7.3}]
 expect(editorialRatingReports(ratings).map(report=>[report.id,report.score,report.subtitle])).toEqual([['brows',8,'Brows'],['jaw',7.3,'Jaw & chin']])
 const input=editorialRatingInput({overallScore:'7.5',potentialScore:'8',potentialCurrentScore:7,potentialScale:8} as Parameters<typeof editorialRatingInput>[0],'',ratings)
 expect(input.overallScore).toBe('');expect(input.potentialScore).toBe('');expect(input.potentialCurrentScore).toBeUndefined()
 expect(input.strongestScore).toBe('8');expect(input.opportunityScore).toBe('7.3')
})
