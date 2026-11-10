import { z } from 'zod'
import { createVideoScript, scriptSectionSchema, type VideoScript } from './video-script'
import { validateProductionScript } from './video-production'
import type { VideoComposition } from './video-composition'
import type { AnalysisPostInput } from './analysis-post'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import type { GeneratorImage } from './content-generator'
import type { CreatorSubjectAnalysis } from './creator-stories'

import { studyBindingSchema } from './creator-studies'

export const privateCharacterLimit = 3
export const followerSectionsSchema=z.array(z.object({feature:z.enum(['overall','eyes','brows','jaw','cheeks','nose','mouth','proportions','hair']),text:z.string().trim().min(20).max(800),evidence:z.array(studyBindingSchema).max(2).optional()}).strict()).min(4).max(8)
export function followerScript(sections:z.infer<typeof followerSectionsSchema>):VideoScript {
  const rows=followerSectionsSchema.parse(sections)
  const script=createVideoScript(rows.map((row,i)=>({id:`follower-${i}`,narration:row.text,delivery:{direction:'Read as one connected, conversational feature breakdown at the preferred Koda pace.',paceWpm:205,pauseAfterMs:120,emphasis:[]}})))
  return validateProductionScript({...script,promotion:'contextual',cues:script.cues.map((cue,i)=>({...cue,section:scriptSectionSchema.parse({id:cue.sourceId,title:i===0?'The hook':i===rows.length-1?'The takeaway':`Look at the ${rows[i].feature}`,role:i===0?'hook':i===rows.length-1?'takeaway':'explanation',priority:100,dependsOn:[],evidence:rows[i].evidence,visuals:[{treatment:'detail',categoryId:rows[i].feature,view:'front',reason:'Trace the visible feature named by this sentence; preserve the photographed anatomy.'}]})}))})
}
// This is provider output as it arrives, never a simulated typewriter.
export function streamedFollowerText(json:string) {
  return [...json.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/g)].map(match=>{let text=match[1];if(text.endsWith('\\'))text=text.slice(0,-1);try{return JSON.parse(`"${text}"`) as string}catch{return ''}}).filter(Boolean).join('\n\n')
}
export type PrivateCharacter = {id:string;name:string;title:string;avatar:string;status:'writing'|'draft'|'speaking'|'ready'|'failed';error?:string}
export type PrivateCharacterDetail=PrivateCharacter & {images:GeneratorImage[];script:VideoScript;analysis?:CreatorSubjectAnalysis;recording?:unknown;editorialRatings?:Array<{feature:string;score:number}>}
export type PrivateLibrary={characters:PrivateCharacter[];remaining:number;resetAt:string}
export type PrivateCharacterEvent={stage:'analyzing'|'writing'|'speaking'|'ready'|'error';text?:string;message?:string;character?:PrivateCharacterDetail}

// Creator-approved subjective ratings stay separate from provider assessments.
export function editorialRatingReports(ratings:NonNullable<PrivateCharacterDetail['editorialRatings']>,imageId?:string):ReportCategory[] {
  const titles:Record<string,string>={overall:'Overall',brows:'Brows',jaw:'Jaw & chin',eyes:'Eye area',mouth:'Mouth & lips',cheeks:'Cheekbone structure',nose:'Nose',proportions:'Facial proportions',skin:'Skin quality'}
  return ratings.filter(rating=>rating.feature!=='potential').map(rating=>({assessmentId:imageId?`editorial:${imageId}`:undefined,assessmentImageId:imageId,id:rating.feature,title:titles[rating.feature]??rating.feature,subtitle:titles[rating.feature]??rating.feature,scoreLabel:titles[rating.feature]??rating.feature,score:rating.score,
    features:rating.feature==='overall'||rating.feature==='proportions'?ratings.filter(item=>!['overall','potential','proportions'].includes(item.feature)).map(item=>({id:`editorial.${item.feature}`,label:titles[item.feature]??item.feature,value:`${item.score.toFixed(1)} / 10`,visual:['jaw','cheeks'].includes(item.feature)?'Rail':'Text',positions:[item.score/10],grade:null,scale:'quality' as const})):[],explanation:'',recommendation:''}))
}
export function editorialRatingInput(input:AnalysisPostInput,subject:string,ratings:NonNullable<PrivateCharacterDetail['editorialRatings']>):AnalysisPostInput {
  const features=ratings.filter(rating=>!['overall','potential'].includes(rating.feature)).toSorted((a,b)=>b.score-a.score),strongest=features[0],opportunity=features.length>1?features.at(-1):undefined
  return {...input,subject,overallScore:ratings.find(rating=>rating.feature==='overall')?.score.toString()??'',potentialScore:ratings.find(rating=>rating.feature==='potential')?.score.toString()??'',potentialScale:ratings.some(rating=>rating.feature==='potential')?10:undefined,potentialCurrentScore:undefined,strongestFeature:strongest?.feature??'',strongestScore:strongest?.score.toString()??'',opportunityFeature:opportunity?.feature??'',opportunityScore:opportunity?.score.toString()??''}
}

export function editorialRatingVisibility(composition:VideoComposition,ratings:NonNullable<PrivateCharacterDetail['editorialRatings']>):VideoComposition {
  return ratings.some(rating=>rating.feature==='overall')?composition:{...composition,scenes:composition.scenes.map(scene=>scene.source.kind==='report'?{...scene,source:{...scene.source,hideScores:true}}:scene)}
}
