import type { GeneratorImage } from './content-generator'
export function featureVariantPhotos(subject:string, baselineImageId = `${subject}-studio-front-20261027`):GeneratorImage[]{
  if (!['marlon','johnson','clavicular'].includes(subject)) return []
  return (['freckles','facial-hair'] as const).map(edit=>({ id:`${subject}-study-${edit}`,name:`${subject} · ${edit} · AI-edited illustration`,dataUrl:`/creator/examples/feature-study-20261028/${subject}-${edit}.png`,width:941,height:1672,status:'ready',landmarks:null,retouch:{feature:edit,operation:'add',baselineImageId} }))
}
