import { GuidedWebCapture } from './guided-web-capture'
import { trackWebEvent } from '@/lib/analytics/client'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CaptureFrame } from '@/components/analysis/capture-frame'
import { Button } from '@/components/ui/button'

type CameraSheetProps = {
  analyticsEnabled?: boolean
  fullscreen?: boolean
  open: boolean
  onCapture: (image: { dataUrl: string; name: string }) => void
  onClose: () => void
  onUpload: () => void
}

export function CameraSheet({ analyticsEnabled = false, fullscreen, open, onCapture, onClose, onUpload }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    let stream: MediaStream | undefined
    const video = videoRef.current
    if (!video) return
    const ready = () => { if (!cancelled) setCameraReady(true) }
    video.addEventListener('playing', ready)

    async function startCamera(video: HTMLVideoElement) {
      if (analyticsEnabled) trackWebEvent('permission_prompted', { surface: 'web_analysis', permission: 'camera' })
      try {
        setCameraReady(false)
        setError(null)
        setCapturedFrame(null)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        if (analyticsEnabled) trackWebEvent('permission_result', { surface: 'web_analysis', permission: 'camera', result: 'granted' })
        video.srcObject = stream
        await video.play()
      } catch (caught) {
        if (analyticsEnabled) trackWebEvent('permission_result', { surface: 'web_analysis', permission: 'camera', result: 'failed', reason_code: caught instanceof DOMException && caught.name === 'NotAllowedError' ? 'permission_denied' : 'camera_unavailable' })
        stream?.getTracks().forEach(track => track.stop())
        if (!cancelled) setError('Camera access is unavailable. Upload a photo instead.')
      }
    }

    void startCamera(video)

    return () => {
      cancelled = true
      video.removeEventListener('playing', ready)
      stream?.getTracks().forEach(track => track.stop())
      video.srcObject = null
    }
  }, [open, fullscreen])

  function takeFrontPhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement('canvas')
    // Match the centered cover crop so the captured photo lines up with the guide.
    const scale = fullscreen && video.clientWidth && video.clientHeight
      ? Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight)
      : null
    canvas.width = scale ? Math.round(video.clientWidth / scale) : video.videoWidth
    canvas.height = scale ? Math.round(video.clientHeight / scale) : video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) return

    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, (video.videoWidth - canvas.width) / 2,
      (video.videoHeight - canvas.height) / 2, canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.92)
  }

  function finishCapture(dataUrl: string) {
    if (analyticsEnabled) trackWebEvent('face_capture_result', { surface: 'web_analysis', result: 'captured' })
    if (fullscreen) flushSync(() => setCapturedFrame(dataUrl))
    onCapture({ dataUrl, name: `camera-${Date.now()}.jpg` })
    onClose()
  }

  return (
    <AnimatePresence onExitComplete={() => setCapturedFrame(null)}>
      {open ? (
        <motion.div
          className={fullscreen ? "scan-camera fixed inset-0 z-50 overflow-hidden bg-black" : "fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black px-4 py-6 sm:px-6"}
          initial={fullscreen ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        >
          {fullscreen && capturedFrame && <div className="scan-camera-still" style={{ backgroundImage: `url(${capturedFrame})` }} />}
          {fullscreen ? <GuidedWebCapture analyticsEnabled={analyticsEnabled} videoRef={videoRef} cameraReady={cameraReady} error={error}
            onClose={onClose} onUpload={onUpload} takeFrontPhoto={() => takeFrontPhoto() ?? null} onComplete={finishCapture} />
          : <div className="relative w-full max-w-[430px]">
            <Button className="absolute right-5 top-5 z-20 size-12 rounded-full bg-white/16 text-white backdrop-blur-md hover:bg-white/24" size="icon" variant="ghost" onClick={onClose}>
              <X className="size-6" aria-hidden="true" />
              <span className="sr-only">Close camera</span>
            </Button>

            <CaptureFrame
              videoRef={videoRef}
              stepLabel="Step 1 of 3"
              title="Look straight ahead"
              subtitle={error || 'Center your face in the frame'}
              action={
                <div className="grid grid-cols-[56px_1fr_56px] items-center gap-5">
                  <Button className="size-14 rounded-2xl bg-white/14 text-white backdrop-blur-md hover:bg-white/22" size="icon" variant="ghost" onClick={onUpload}>
                    <ImagePlus className="size-6" aria-hidden="true" />
                    <span className="sr-only">Upload image</span>
                  </Button>
                  <button
                    className="mx-auto grid size-[78px] place-items-center rounded-full border-[5px] border-white bg-white/10 p-1 active:scale-95"
                    onClick={() => { const photo = takeFrontPhoto(); if (photo) finishCapture(photo) }}
                    type="button"
                    aria-label="Take photo"
                  >
                    <span className="block size-full rounded-full bg-[#f5efe6]" />
                  </button>
                  <Button className="size-14 rounded-2xl bg-white/14 text-white backdrop-blur-md hover:bg-white/22" size="icon" variant="ghost" onClick={() => { const photo = takeFrontPhoto(); if (photo) finishCapture(photo) }}>
                    <Camera className="size-6" aria-hidden="true" />
                    <span className="sr-only">Capture</span>
                  </Button>
                </div>
              }
            />
          </div>}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
