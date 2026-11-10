import { useEffect, useState } from 'react'

const portraits=new Map<string,Promise<string>>()
function portraitThumbnail(src:string){
  let pending=portraits.get(src)
  if(!pending){
    pending=(async()=>{
      const original=new Image();original.crossOrigin='anonymous';original.src=src;await original.decode()
      const scale=Math.min(1,640/Math.max(original.naturalWidth,original.naturalHeight))
      const resized=document.createElement('canvas');resized.width=Math.round(original.naturalWidth*scale);resized.height=Math.round(original.naturalHeight*scale)
      resized.getContext('2d')!.drawImage(original,0,0,resized.width,resized.height)
      // MediaPipe needs the bitmap and element dimensions to agree.
      const image=new Image();image.src=resized.toDataURL();await image.decode()
      const {cutout}=await import('@/lib/creator/editorial-posters')
      const canvas=await cutout(image)
      return canvas.toDataURL('image/webp',.9)
    })().catch(error=>{portraits.delete(src);throw error})
    if(portraits.size>=24)portraits.delete(portraits.keys().next().value!)
    portraits.set(src,pending)
  }
  return pending
}

/** The same segmentation used in exported portraits, cached at thumbnail resolution. */
export function CreatorPortrait({src,initials=''}:{src:string;initials?:string}){
  const [portrait,setPortrait]=useState<{source:string;url:string}|null>(null)
  useEffect(()=>{
    let disposed=false
    void portraitThumbnail(src).then(url=>{if(!disposed)setPortrait({source:src,url})}).catch(()=>{/* Keep the neutral placeholder instead of showing an uncut photo. */})
    return()=>{disposed=true}
  },[src])
  return portrait?.source===src?<img src={portrait.url} alt="" draggable={false}/>:<span aria-hidden="true">{initials}</span>
}
