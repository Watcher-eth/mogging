import {CreatorPortrait} from './creator-portrait'
import {useEffect,useRef,useState} from 'react'
import useSWR from 'swr'
import * as Dialog from '@radix-ui/react-dialog'
import {ArrowUpRight,Check,Plus,ScanFace,Upload,X} from 'lucide-react'
import {apiGet} from '@/lib/api/client'
import type {PrivateCharacterDetail,PrivateCharacterEvent,PrivateLibrary} from '@/lib/creator/private-character'
import type {GeneratorImage} from '@/lib/creator/content-generator'
import styles from './private-character-studio.module.css'

type Props={enabled:boolean;selectedId?:string;onSelect:(character:PrivateCharacterDetail)=>Promise<void>;preview?:boolean}
const endpoint='/api/creator/private-characters'
const labels={analyzing:'Reading the face',writing:'Finding the story',speaking:'Recording the voice',ready:'Bringing it together',error:'Let’s try that again'}
async function imageFile(file:File,index:number):Promise<GeneratorImage>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Choose JPEG, PNG or WebP files under 20 MB.')
  const bitmap=await createImageBitmap(file),scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
  canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
  const dataUrl=canvas.toDataURL('image/jpeg',.88)
  const {detectFaceLandmarksFromDataUrl}=await import('@/lib/client/faceLandmarks')
  const result=await detectFaceLandmarksFromDataUrl(dataUrl)
  if(result.status!=='detected')throw new Error(`${file.name}: choose a clear photo containing one visible face.`)
  return {id:`follower-${crypto.randomUUID()}-front-${index}`,name:file.name,dataUrl,width:canvas.width,height:canvas.height,status:'ready',landmarks:result.landmarks}
}
async function streamJob(body:unknown,signal:AbortSignal,onEvent:(event:PrivateCharacterEvent)=>void){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal})
  if(!response.ok){const value=await response.json();throw new Error(value.error?.message??value.error??'Could not start generation.')}
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',complete=false
  try{while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let split:number
    while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);for(const line of frame.split('\n'))if(line.startsWith('data: ')){const event=JSON.parse(line.slice(6)) as PrivateCharacterEvent;if(event.stage==='error')throw new Error(event.message);if(event.character)complete=true;onEvent(event)}}
  }if(!complete)throw new Error('The connection ended early. Your character is saved in the private library.')}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export function PrivateCharacterStudio({enabled,selectedId,onSelect,preview=false}:Props){
  const {data,mutate}=useSWR<PrivateLibrary>(enabled?endpoint:null,apiGet,{shouldRetryOnError:false,revalidateOnFocus:true,refreshInterval:latest=>latest?.characters?.some(person=>['writing','speaking'].includes(person.status))?3000:0})
  const library=preview?{characters:[],remaining:3,resetAt:''}:data
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[files,setFiles]=useState<File[]>([]),[consent,setConsent]=useState(false)
  const [event,setEvent]=useState<PrivateCharacterEvent|null>(null),[draft,setDraft]=useState<PrivateCharacterDetail|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false)
  const abort=useRef<AbortController|null>(null),trigger=useRef<HTMLElement|null>(null)
  useEffect(()=>()=>abort.current?.abort(),[])
  if(!library?.characters)return null
  const close=()=>{abort.current?.abort();setOpen(false);void mutate()}
  async function select(id:string){trigger.current=document.activeElement as HTMLElement;setWorking(false);setError('');try{const character=await apiGet<PrivateCharacterDetail>(`${endpoint}?id=${id}`);if(character.status==='ready'){await onSelect(character);return}setDraft(character);setEvent(null);setOpen(true)}catch(reason){setError(reason instanceof Error?reason.message:'Could not open this character.')}}
  async function run(speak=false){
    if(preview){setEvent({stage:'writing',text:'The jaw gets your attention. But the real story starts one feature higher. Watch how the cheekbones set the width, then let the lower face taper beneath them.'});setWorking(true);return}
    const controller=new AbortController();abort.current=controller;setWorking(true);setError('');setEvent({stage:speak?'speaking':'analyzing'})
    try{
      const body=speak?{action:'speak',id:draft!.id,revision:draft!.script.revision}:draft?.status==='failed'?{action:'retry',id:draft.id}:{id:crypto.randomUUID(),name,images:await Promise.all(files.map(imageFile)),consent}
      let result:PrivateCharacterDetail|undefined
      await streamJob(body,controller.signal,update=>{setEvent(update);if(update.character){result=update.character;setDraft(update.character)}})
      await mutate()
      if(result?.status==='ready'){await onSelect(result);setOpen(false)}
    }catch(reason){if(!controller.signal.aborted){setError(reason instanceof Error?reason.message:'Could not finish this character.');setEvent({stage:'error'})}}
    finally{if(!controller.signal.aborted)setWorking(false);abort.current=null}
  }
  const writing=event?.stage==='writing',words=(event?.text??'').split(/\s+/).filter(Boolean),start=Math.max(0,words.length-36)
  return <section className={styles.library} aria-label="Your private characters">
    <div className={styles.libraryHeading}><div><h3>Your people</h3><p>Private to your Studio · {library.remaining} of 3 new people left today</p></div><button type="button" className={styles.add} disabled={!library.remaining} onClick={event=>{trigger.current=event.currentTarget;setWorking(false);setDraft(null);setName('');setFiles([]);setConsent(false);setEvent(null);setError('');setOpen(true)}}><Plus size={16}/>Add a person</button></div>
    <div className={styles.people}>{library.characters.map(character=><button type="button" key={character.id} aria-pressed={selectedId===`private:${character.id}`} onClick={()=>void select(character.id)} className={styles.person}><span className={styles.avatar}><CreatorPortrait src={character.avatar}/></span><span><strong>{character.name||character.title||'Untitled story'}</strong><small>{character.status==='ready'?'Story & voice ready':character.status==='draft'?'Review the script':character.status==='failed'?'Retry generation':'Being created'}</small></span><ArrowUpRight size={16}/></button>)}</div>
    {error&&!open?<p role="alert" className={styles.error}>{error}</p>:null}
    <Dialog.Root open={open} onOpenChange={value=>{if(!value)close();else setOpen(true)}}><Dialog.Portal>
      <Dialog.Overlay className={styles.backdrop}/><Dialog.Content className={styles.dialog} aria-busy={working} onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus()}}>
        <Dialog.Close className={styles.close} aria-label={working?'Stop generation and close':'Close'}><X size={18}/></Dialog.Close>
        {working?<div className={styles.loading}><div className={styles.orbit} aria-hidden="true"><span/><ScanFace size={28} strokeWidth={1.2}/></div><Dialog.Title className={styles.loadingTitle} key={event?.stage}>{labels[event?.stage??'analyzing']}</Dialog.Title><Dialog.Description className={styles.subtle}>{writing?'One clear story, built around this face.':event?.stage==='speaking'?'Koda is bringing your approved words to life.':event?.stage==='ready'?'Matching your photos, voice and captions.':'Looking for the details that make this face distinctive.'}</Dialog.Description>
          {words.length?<div className={styles.stream} aria-hidden="true">{words.slice(start).map((word,i)=><span key={start+i}>{word}{' '}</span>)}</div>:null}
          <p role="status" aria-live="polite" className={styles.status}>{event?.stage==='analyzing'?'Analyzing your photo':event?.stage==='writing'?'Writing your script live':event?.stage==='ready'?'Preparing your video':'Creating voiceover and captions'}</p>
          <button className={styles.cancel} type="button" onClick={close}>Stop for now</button>
        </div>:draft?.script?<><header className={styles.header}><span className={styles.eyebrow}>YOUR NEW STORY</span><Dialog.Title>{draft.title}</Dialog.Title><Dialog.Description>Read it once. Then bring it to life.</Dialog.Description></header><div className={styles.script}>{draft.script.cues.map(cue=><p key={cue.id}>{cue.text}</p>)}</div>{error?<p role="alert" className={styles.error}>{error}</p>:null}<footer className={styles.footer}><p><Check size={14}/>Private to your Studio · Koda voice</p><button className={styles.primary} type="button" onClick={()=>void run(true)}>Approve script & create video<ArrowUpRight size={16}/></button></footer></>:draft?.status==='failed'?<><header className={styles.header}><Dialog.Title>Finish this story</Dialog.Title><Dialog.Description>Your saved photos are ready. Retrying this person won’t use another daily slot.</Dialog.Description></header>{error?<p role="alert" className={styles.error}>{error}</p>:null}<button className={styles.primary} type="button" onClick={()=>void run()}>Retry saved person<ArrowUpRight size={16}/></button></>:<form onSubmit={event=>{event.preventDefault();void run()}}><header className={styles.header}><span className={styles.eyebrow}>A FACE. A STORY.</span><Dialog.Title>Who’s next?</Dialog.Title><Dialog.Description>Add someone from your community. We’ll find their story.</Dialog.Description></header>
          <label className={styles.upload}><Upload size={24} strokeWidth={1.4}/><strong>{files.length?`${files.length} ${files.length===1?'photo':'photos'} selected`:'Choose their photos'}</strong><span>One clear front photo. Up to four images.</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Follower photos" onChange={event=>{setFiles(Array.from(event.target.files??[]).slice(0,4));setError('')}}/></label>
          <label className={styles.name}><span>Name <small>optional</small></span><input value={name} maxLength={80} placeholder="What should we call them?" onChange={event=>setName(event.target.value)}/></label>
          <label className={styles.consent}><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>I have permission to use these photos and share them with Moonshot for analysis, and the approved script/audio with Google Gemini for narration and caption timing.</span></label>
          {error?<p role="alert" className={styles.error}>{error}</p>:null}<footer className={styles.footer}><p>{library.remaining} new people left today · resets at midnight UTC</p><button className={styles.primary} type="submit" disabled={!files.length||!consent}>Create their story<ArrowUpRight size={16}/></button></footer>
        </form>}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>
}
