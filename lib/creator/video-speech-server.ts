import { ApiError } from '@/lib/api/http'
import { geminiSpeechRequest, googleWordTimes, geminiWordTimes, pcmWave, alignSpeechWords, type VoiceDirection } from './video-speech'
import type { z } from 'zod'
import type { deliverySchema } from './video-speech'

export async function generateCreatorSpeech(text:string,voice:VoiceDirection,delivery:z.infer<typeof deliverySchema>|undefined,signal:AbortSignal) {
const apiKey=process.env.GEMINI_API_KEY
if(!apiKey)throw new ApiError(503,'Speech generation is not configured')
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(geminiSpeechRequest(text, voice, delivery)), signal: AbortSignal.any([signal,AbortSignal.timeout(80000)]) })
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Gemini speech quota reached. Wait before retrying.' : 'Gemini speech generation failed. Check model access and server configuration.')
    const payload = await response.json()
    const audio = payload.steps?.filter((step: { type: string }) => step.type === 'model_output').flatMap((step: { content?: Array<{ type: string; data?: string }> }) => step.content ?? []).filter((content: { type: string }) => content.type === 'audio').at(-1)
    if (!audio?.data || typeof audio.data !== 'string' || audio.data.length > 4 * 1024 * 1024) throw new ApiError(502, 'Gemini did not return a supported audio segment.')
    if (audio.mime_type && !/^audio\/(l16|pcm)(;|$)/i.test(audio.mime_type)) throw new ApiError(502, 'Gemini returned a different audio format than the requested PCM.')
    const pcm = Buffer.from(audio.data, 'base64')
    if (!pcm.length || pcm.length % 2 || pcm.length > 24000 * 2 * 40) throw new ApiError(502, 'Gemini returned an invalid or oversized PCM segment.')
    let words: Array<{ text: string; startMs: number; endMs: number }> | undefined, alignmentError: string | undefined
    const speechKey = process.env.GOOGLE_SPEECH_API_KEY
    if (speechKey) {
      try {
        const recognized = await fetch('https://speech.googleapis.com/v1/speech:recognize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': speechKey }, body: JSON.stringify({ config: { encoding: 'LINEAR16', sampleRateHertz: 24000, audioChannelCount: 1, languageCode: 'en-US', enableWordTimeOffsets: true, enableAutomaticPunctuation: true }, audio: { content: audio.data } }), signal: AbortSignal.any([signal,AbortSignal.timeout(35000)]) })
        if (!recognized.ok) throw new Error('Recognition unavailable. Check Cloud Speech-to-Text access, billing and quota.')
        words = googleWordTimes(await recognized.json(), pcm.length / 48)
      } catch (error) { alignmentError = error instanceof Error ? error.message : 'Word recognition failed; audio is preserved.' }
    }
    if(!speechKey) {
      try {
        const recognized=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({model:'gemini-3.5-transcribe',input:[{type:'audio',data:Buffer.from(pcmWave([new Uint8Array(pcm)])).toString('base64'),mime_type:'audio/wav'}],generation_config:{transcription_config:{language_codes:['en-US'],mode:{type:'verbatim',timestamp_granularities:['word']}}},store:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(55000)])})
        if(!recognized.ok)throw new Error('Word timing is temporarily unavailable; the voice recording is preserved.')
        const value=await recognized.json() as {steps?:Array<{content?:Array<{annotations?:Array<{type:string;text:string;start_offset:string;end_offset:string}>}>}>}
        const annotations=(value.steps??[]).flatMap(step=>(step.content??[]).flatMap(content=>(content.annotations??[]).filter(annotation=>annotation.type==='word_info')))
        words=geminiWordTimes(annotations,pcm.length/48,text)
      }catch(error){alignmentError=error instanceof Error?error.message:'Caption timing could not be measured.'}
    }
    if(words){try{words=alignSpeechWords(text,words)}catch(error){words=undefined;alignmentError=error instanceof Error?error.message:'Review the recognized transcript.'}}
    return { audio: audio.data as string, sampleRate: 24000, durationMs: pcm.length / 48, words, alignmentError }
}
