import { DesktopCaptureExample, DesktopCaptureOval } from './desktop-capture-oval'
import { GuidedWebCapture } from './guided-web-capture'
import { trackWebEvent } from '@/lib/analytics/client'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, ImagePlus, Images, X } from '@/components/ui/mogging-glyphs'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CaptureFrame } from '@/components/analysis/capture-frame'
import { Button } from '@/components/ui/button'
import { guidedCameraFrame } from '@/lib/client/guided-camera-frame'

type CameraSheetProps = {
  analyticsEnabled?: boolean
  fullscreen?: boolean
  desktop?: boolean
  side?: boolean
  open: boolean
  onCapture: (image: { dataUrl: string; name: string }) => void
  onFrontPhoto?: (dataUrl: string | null) => void
  onClose: () => void
  onUpload: () => void
}

export function CameraSheet({ analyticsEnabled = false, fullscreen, desktop, side, open, onCapture, onFrontPhoto, onClose, onUpload }: CameraSheetProps) {
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
    const started = performance.now()
    let firstFrame = false
    let frameTimeout: number | undefined
    const track = (result: string, reason_code?: string) => {
      if (analyticsEnabled) trackWebEvent('face_capture_result', { surface: 'web_analysis', step: 'capture.camera', result, reason_code, duration_ms: Math.round(performance.now() - started) })
    }
    const ready = () => {
      if (cancelled || firstFrame || !video.videoWidth) return
      firstFrame = true
      window.clearTimeout(frameTimeout)
      track('first_frame')
      setCameraReady(true)
    }
    video.addEventListener('playing', ready)

    async function startCamera(video: HTMLVideoElement) {
      if (analyticsEnabled) trackWebEvent('permission_prompted', { surface: 'web_analysis', permission: 'camera' })
      try {
        setCameraReady(false)
        setError(null)
        setCapturedFrame(null)
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: fullscreen ? { facingMode: 'user' } : {
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
        frameTimeout = window.setTimeout(() => {
          if (cancelled || firstFrame) return
          track('failed', 'camera_no_frames')
          stream?.getTracks().forEach(track => track.stop())
          setError('The camera didn’t start')
        }, 8000)
        await video.play()
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) ready()
      } catch (caught) {
        if (cancelled) return
        window.clearTimeout(frameTimeout)
        const denied = caught instanceof DOMException && caught.name === 'NotAllowedError'
        if (stream) track('failed', 'camera_playback_failed')
        else if (analyticsEnabled) trackWebEvent('permission_result', { surface: 'web_analysis', permission: 'camera', result: 'failed', reason_code: denied ? 'permission_denied' : 'camera_unavailable' })
        stream?.getTracks().forEach(track => track.stop())
        setError(denied && !stream ? 'Camera access is off' : 'Camera unavailable')
      }
    }

    void startCamera(video)

    return () => {
      cancelled = true
      window.clearTimeout(frameTimeout)
      video.removeEventListener('playing', ready)
      stream?.getTracks().forEach(track => track.stop())
      video.srcObject = null
    }
  }, [analyticsEnabled, open, fullscreen, desktop])

  function takeFrontPhoto(zoom = 1) {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement('canvas')
    // Match the visible preview, including any crop the user applied by pinching.
    const scale = desktop && video.clientWidth && video.clientHeight
      ? Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight)
      : null
    const frame = fullscreen && video.clientWidth && video.clientHeight ? guidedCameraFrame(video, zoom) : null
    canvas.width = frame ? Math.round(video.videoWidth / Math.max(1, frame.width)) : scale ? Math.round(video.clientWidth / scale) : video.videoWidth
    canvas.height = frame ? Math.round(video.videoHeight / Math.max(1, frame.height)) : scale ? Math.round(video.clientHeight / scale) : video.videoHeight

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
    if (analyticsEnabled) trackWebEvent('face_capture_result', { surface: 'web_analysis', result: 'captured', step: 'capture.done', source: 'camera' })
    if (fullscreen) flushSync(() => setCapturedFrame(dataUrl))
    onCapture({ dataUrl, name: `camera-${Date.now()}.jpg` })
    onClose()
  }

  return (
    <AnimatePresence onExitComplete={() => setCapturedFrame(null)}>
      {open ? (
        <motion.div
          className={fullscreen ? "absolute inset-0 z-50 overflow-hidden bg-black" : "fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black px-4 py-6 sm:px-6"}
          initial={fullscreen ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        >
          {fullscreen ? <div className="absolute inset-0">
            {capturedFrame && <div className="scan-camera-still" style={{ backgroundImage: `url(${capturedFrame})` }} />}
            <GuidedWebCapture analyticsEnabled={analyticsEnabled} videoRef={videoRef} cameraReady={cameraReady} error={error}
              onUpload={onUpload} onClose={onClose} takeFrontPhoto={takeFrontPhoto} onFrontPhoto={onFrontPhoto} onComplete={finishCapture} />
          </div>
          : desktop ? <div className="desktop-live-capture">
            <button type="button" className="desktop-live-close" aria-label="Close camera" onClick={onClose}><X size={22} /></button>
            <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted autoPlay />
            {!cameraReady && <DesktopCaptureExample side={side} />}
            <DesktopCaptureOval side={side} light />
            <div className="desktop-live-actions">
              <p role="status">{error || (!cameraReady ? 'Preparing your camera…' : side ? 'Turn fully to one side' : 'Look straight ahead')}</p>
              <div>
                <button type="button" className="desktop-capture-gallery" onClick={onUpload} aria-label="Open photo gallery"><Images size={21} /></button>
                <button type="button" className="desktop-capture-shutter" disabled={!cameraReady} aria-label="Take photo"
                  onClick={() => { const photo = takeFrontPhoto(); if (photo) finishCapture(photo) }}><span /></button>
              </div>
            </div>
          </div>
          : <div className="relative w-full max-w-[430px]">
            <Button className="absolute right-5 top-5 z-20 size-12 rounded-full bg-white/16 text-white backdrop-blur-md hover:bg-white/24" size="icon" variant="ghost" onClick={onClose}>
              <X className="size-6" aria-hidden="true" />
              <span className="sr-only">Close camera</span>
            </Button>

            <CaptureFrame
              videoRef={videoRef}
              showStepIndicator={false}
              title={side ? 'Turn to the side' : 'Look straight ahead'}
              subtitle={error || (side ? 'Keep your full profile in frame' : 'Center your face in the frame')}
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
