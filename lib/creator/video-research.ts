import { creatorStudies, type StudyBinding } from './creator-studies'
import { sceneSpeechWords, scriptTokens } from './video-script'
import { smoothMotion } from './video-layout'
import type { VideoComposition } from './video-composition'

export function scientificEvidenceAt(composition: VideoComposition, timeMs: number) {
  const scene=composition.scenes.find(s=>timeMs>=s.startMs && timeMs<s.startMs+s.durationMs)
  if(!scene || !['portrait','explainer'].includes(scene.source.kind))return
  const cue=composition.script?.cues.find(c=>c.id===scene.scriptRange?.cueId)
  if(!cue?.section?.evidence?.length)return
  const group=composition.scenes.filter(s=>s.scriptRange?.cueId===cue.id)
  const words=group.flatMap(s=>sceneSpeechWords(s).map(w=>({...w,startMs:w.startMs+s.startMs})))
  const cueEnd=Math.max(...group.map(s=>s.startMs+s.durationMs))
  for(const binding of cue.section.evidence){
    const index=cue.text.indexOf(binding.anchor);if(index<0)continue
    const word=scriptTokens(cue.text.slice(0,index)).length
    const start=words[word]?.startMs;if(start===undefined)continue
    const end=Math.min(start+4520,cueEnd)
    if(end-start<3520 || timeMs<start || timeMs>=end)continue
    return {binding,startMs:start,endMs:end}
  }
}
export function drawStudyCard(ctx:CanvasRenderingContext2D,binding:StudyBinding,elapsedMs:number,remainingMs:number,reduced=false,top=580) {
  const study=creatorStudies[binding.studyId],enter=reduced?1:smoothMotion(elapsedMs/300),exit=reduced?1:smoothMotion(remainingMs/220)
  ctx.save();ctx.globalAlpha*=enter*exit;ctx.translate(0,10*(1-enter))
  const x=120,y=top,width=950,height=164
  ctx.fillStyle='rgba(252,253,254,.96)';ctx.strokeStyle='rgba(45,60,75,.13)';ctx.lineWidth=1.5;ctx.shadowColor='rgba(12,20,28,.09)';ctx.shadowBlur=24;ctx.shadowOffsetY=5;ctx.beginPath();ctx.roundRect(x,y,width,height,23);ctx.fill();ctx.shadowColor='transparent';ctx.stroke()
  ctx.fillStyle='#4c5965';ctx.font='500 23px Arial, sans-serif';ctx.fillText(`${study.authors} · ${study.year}`,x+24,y+34)
  ctx.fillStyle='#18212a';ctx.font='500 31px Arial, sans-serif';ctx.fillText(study.title,x+24,y+75,width-48)
  ctx.fillStyle='#596570';ctx.font='400 22px Arial, sans-serif';ctx.fillText(study.method,x+24,y+109,width-48)
  ctx.fillStyle='#78838d';ctx.font='400 19px Arial, sans-serif';ctx.fillText(`${study.journal} · doi:${study.doi}`,x+24,y+140,width-48);ctx.restore()
}
export function drawScientificEvidence(ctx:CanvasRenderingContext2D,composition:VideoComposition,timeMs:number,reduced=false,top=580){
  const evidence=scientificEvidenceAt(composition,timeMs);if(!evidence)return
  drawStudyCard(ctx,evidence.binding,timeMs-evidence.startMs,evidence.endMs-timeMs,reduced,top)
}
