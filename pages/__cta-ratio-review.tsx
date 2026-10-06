import { useEffect, useState } from 'react'
import { generateSlides, type GeneratorImage } from '@/lib/creator/content-generator'
import { renderSlidePng } from '@/lib/creator/export-slides'
export default function Review() {
  const [items,setItems]=useState<Array<{name:string;src:string}>>([])
  const [error,setError]=useState('')
  useEffect(()=>{let stopped=false;void(async()=>{
    const images:GeneratorImage[]=[{id:'example',name:'Example portrait',dataUrl:'/model2.png',width:1024,height:1536,landmarks:null,status:'ready'}]
    const slides=generateSlides({campaignGoal:'conversion',tone:'curious',selectedCategories:['eyes','jaw','nose'],images,offer:'',seed:1,currentScore:'6.4',potentialScore:'8.9',scoreValues:{eyes:'6.8',jaw:'6.2',nose:'7.1'}})
    const rendered=[]
    for(const slide of slides){const blob=await renderSlidePng({slide,images,width:1080,height:1080});const src=await new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob)});rendered.push({name:slide.templateId,src})}
    if(!stopped){setItems(rendered);(window as Window & {ctaExports?:typeof rendered}).ctaExports=rendered}
  })().catch(e=>setError(String(e)));return()=>{stopped=true}},[])
  return <main style={{background:'#f3f4f6',padding:24}}><h1 style={{fontSize:24,fontWeight:600,marginBottom:8}}>Square CTA exports · 1080 × 1080</h1><p style={{marginBottom:24,color:'#71717a'}}>Five templates · consistent bottom breathing room</p>{error}<div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:20}}>{items.map(item=><figure key={item.name}><img src={item.src} alt={item.name} style={{width:'100%',aspectRatio:'1'}}/><figcaption style={{padding:'10px 0',fontSize:14}}>{item.name}</figcaption></figure>)}</div></main>
}
