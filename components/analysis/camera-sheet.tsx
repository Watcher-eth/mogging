import { AnimatePresence, motion } from 'motion/react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CaptureFrame } from '@/components/analysis/capture-frame'
import { Button } from '@/components/ui/button'

type CameraSheetProps = {
  open: boolean
  onCapture: (image: { dataUrl: string; name: string }) => void
  onClose: () => void
  onUpload: () => void
}

export function CameraSheet({ open, onCapture, onClose, onUpload }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false

    async function startCamera() {
      try {
        setError(null)
        const stream = await navigator.mediaDevices.getUserMedia({
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

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => null)
        }
      } catch {
        setError('Camera access is unavailable. Upload a photo instead.')
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [open])

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) return

    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    onCapture({
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      name: `camera-${Date.now()}.jpg`,
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black px-4 py-6 sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="relative w-full max-w-[430px]">
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
                    onClick={capturePhoto}
                    type="button"
                    aria-label="Take photo"
                  >
                    <span className="block size-full rounded-full bg-[#f5efe6]" />
                  </button>
                  <Button className="size-14 rounded-2xl bg-white/14 text-white backdrop-blur-md hover:bg-white/22" size="icon" variant="ghost" onClick={capturePhoto}>
                    <Camera className="size-6" aria-hidden="true" />
                    <span className="sr-only">Capture</span>
                  </Button>
                </div>
              }
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
