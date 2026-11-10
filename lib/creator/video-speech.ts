import { z } from 'zod'

export const voicePresets = {
  editorial: { label: 'Koda · preferred narrator', voice: 'en-us-koda' as const, direction: 'Independent narrator, never imitate the person pictured. Brisk, upbeat conversational English, approximately 205 words per minute. Tell one connected story with natural contractions, purposeful emphasis and distinct energy for setup, evidence and payoff. Read the exact transcript in order, without additions, paraphrasing or omitted brand names. Keep pauses brief but let the visual idea land. No slow documentary voice, dramatic trailer delivery, monotone list or advertising voice. Maintain the same natural pace through product mentions. Mogging.com is pronounced Mogging dot com; Mogging rhymes with dog. Read scores clearly.' },
  conversational: { label: 'Warm, conversational guide', voice: 'Algieba' as const, direction: 'Explain one useful observation to a curious friend. Warm, relaxed and specific, about 165 words per minute. Natural contractions and restrained emphasis. Carry the same conversational energy through product mentions; never switch to an advertising voice. Do not imitate the pictured person.' },
  curious: { label: 'Curious visual storyteller', voice: 'Orus' as const, direction: 'A curious documentary storyteller following visible evidence. Open with a genuine question, then resolve it with clear observations. Conversational, purposeful and lightly animated, about 165 words per minute. No artificial cliffhangers, hype or celebrity imitation. Product mentions should feel like part of the demonstration.' },
  expert: { label: 'Professional anatomy analyst', voice: 'Charon' as const, direction: 'A calm, knowledgeable documentary analyst explaining visible facial structure. Precise, grounded and quietly authoritative. Medium-low energy with purposeful emphasis, clean articulation and approximately 155 words per minute. Distinguish visible contours from underlying anatomy. No dramatic trailer delivery, gravelly celebrity impression or sales pitch. Speak as an independent expert, never imitate the person pictured.' },
} as const
export const voiceDirectionSchema = z.object({ preset: z.enum(['editorial', 'expert', 'conversational', 'curious']), voice: z.enum(['Puck', 'Charon', 'Algieba', 'Orus', 'Iapetus', 'Kore', 'en-us-koda', 'en-us-brio', 'en-us-knox', 'en-us-fola', 'en-us-zali']), direction: z.string().trim().min(1).max(1800) }).strict()
export const deliverySchema = z.object({ direction: z.string().max(400).default(''), emphasis: z.array(z.string().min(1).max(80)).max(8).default([]), paceWpm: z.number().min(100).max(240).optional(), pauseAfterMs: z.number().int().min(0).max(1000).default(120) }).strict()
export type VoiceDirection = z.infer<typeof voiceDirectionSchema>
export type SpeechDelivery = z.infer<typeof deliverySchema>
export function voiceDirection(preset: keyof typeof voicePresets): VoiceDirection {
  return { preset, voice: voicePresets[preset].voice, direction: voicePresets[preset].direction }
}
export function speechStyle(voice: VoiceDirection, delivery?: SpeechDelivery) {
  return [voice.direction, delivery?.direction, delivery?.emphasis.length ? `Gently emphasize: ${delivery.emphasis.join('; ')}.` : ''].filter(Boolean).join(' ')
}
export function geminiSpeechRequest(text: string, voice: VoiceDirection, delivery?: SpeechDelivery) {
  return { model: 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: [speechStyle(voice, delivery), /\bMogging/i.test(text) ? 'Pronounce Mogging as MOG-ing with a hard g, rhyming with dog. Never say mocking or margin.' : ''].filter(Boolean).join(' ') }] }] }], response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 }, generation_config: { speech_config: [{ voice: voice.voice }] }, store: false }
}

export function pcmWave(chunks: Uint8Array[], sampleRate = 24000) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  if (!size || size % 2 || size > sampleRate * 2 * 180) throw new Error('Use valid mono 16-bit PCM below three minutes')
  const output = new Uint8Array(44 + size), view = new DataView(output.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + size, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, size, true)
  let offset = 44
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

export function googleWordTimes(value: unknown, durationMs: number) {
  const timestamp = z.string().regex(/^\d+(?:\.\d+)?s$/)
  const response = z.object({ results: z.array(z.object({ alternatives: z.array(z.object({ words: z.array(z.object({ word: z.string().min(1), startTime: timestamp.default('0s'), endTime: timestamp })) })).min(1) })).min(1) }).parse(value)
  const words = response.results.flatMap(result => result.alternatives[0].words.map(word => ({ text: word.word, startMs: Number(word.startTime.slice(0, -1)) * 1000, endMs: Number(word.endTime.slice(0, -1)) * 1000 })))
  let previous = 0
  for (const word of words) {
    if (word.startMs < previous || word.endMs <= word.startMs || word.endMs > durationMs + .01) throw new Error('Recognition returned invalid word boundaries; review the recording.')
    previous = word.endMs
  }
  if (!words.length) throw new Error('No spoken words were recognized.')
  return words
}

// Keep approved caption tokens while retaining the recognized spoken intervals.
// A decimal or Mogging.com can be several ASR words but one caption word.
export function alignSpeechWords(text:string,observed:Array<{text:string;startMs:number;endMs:number}>) {
  const names=['zero','one','two','three','four','five','six','seven','eight','nine','ten']
  const normalize=(value:string)=>value.toLowerCase().replace(/\b\d+(?:\.\d+)?\b/g,number=>{
    const [whole,decimal]=number.split('.');return (names[Number(whole)]??whole)+(decimal?' point '+[...decimal].map(digit=>names[Number(digit)]).join(' '):'')
  }).replace(/[^\p{L}\p{N}]+/gu,'').replace(/mugging|marging|moggin(?!g)/g,'mogging').replace(/dotcom/g,'com')
  const sameWord=(heard:string,written:string)=>{
    const a=normalize(heard),b=normalize(written)
    if(a===b)return true
    // The script supplies the brand. ASR may spell this unfamiliar proper noun
    // differently; only its measured interval is reused. Scores remain exact.
    if(!/^mogging(?:s|com)?$/.test(b)||!/^m[\p{L}]+$/u.test(a)||Math.abs(a.length-b.length)>2)return false
    let row=Array.from({length:b.length+1},(_,i)=>i)
    for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next}
    return row[b.length]<=2
  }
  const expected=[...text.matchAll(/[\p{L}\p{N}]+(?:['’.][\p{L}\p{N}]+)*/gu)].map(match=>match[0])
  let cursor=0
  const words=expected.map(word=>{
    const candidates=Array.from({length:Math.min(4,observed.length-cursor)},(_,i)=>i+1)
    // Prefer an exact multiword match before trying a brand spelling variant.
    const count=candidates.find(count=>normalize(observed.slice(cursor,cursor+count).map(item=>item.text).join(' '))===normalize(word))
      ??candidates.find(count=>sameWord(observed.slice(cursor,cursor+count).map(item=>item.text).join(' '),word))
    if(count===undefined)throw new Error('The recognized words differ from the approved script; the voice is preserved for review.')
    const first=observed[cursor],last=observed[cursor+count-1];cursor+=count
    return {text:word,startMs:first.startMs,endMs:last.endMs}
  })
  if(cursor!==observed.length)throw new Error('The recording contains extra recognized words; review it before using measured captions.')
  return words
}

export function geminiWordTimes(value:unknown,durationMs:number,text:string) {
  const offset=z.string().regex(/^\d+(?:\.\d+)?s$/)
  const annotations=z.array(z.object({text:z.string().min(1),start_offset:offset,end_offset:offset})).min(1).parse(value)
  const aligned=alignSpeechWords(text,annotations.map(word=>({text:word.text,startMs:parseFloat(word.start_offset)*1000,endMs:parseFloat(word.end_offset)*1000})))
  // Gemini offsets are rounded. Trim a small final overrun to the actual PCM end;
  // reject materially wrong intervals rather than inventing caption timing.
  if(aligned.some(word=>word.endMs>durationMs+200))throw new Error('Recognition timing extends outside the audio; review the recording.')
  return googleWordTimes({results:[{alternatives:[{words:aligned.map(word=>({word:word.text,startTime:`${word.startMs/1000}s`,endTime:`${Math.min(word.endMs,durationMs)/1000}s`}))}]}]},durationMs)
}
