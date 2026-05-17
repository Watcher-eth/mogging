import { ImagePlus } from 'lucide-react'
import Image from 'next/image'
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject, type ReactNode, type WheelEvent } from 'react'

export type CaptureFrameImagePosition = {
  x: number
  y: number
  scale: number
}

type CaptureFrameProps = {
  action?: ReactNode
  className?: string
  imageAlt?: string
  imagePosition?: CaptureFrameImagePosition
  imageSrc?: string | null
  muted?: boolean
  onEmptyClick?: () => void
  onImagePositionChange?: (position: CaptureFrameImagePosition) => void
  onMediaClick?: () => void
  showStepIndicator?: boolean
  stepLabel?: string
  subtitle?: string
  title?: string
  videoRef?: RefObject<HTMLVideoElement | null>
}

export function CaptureFrame({
  action,
  className = '',
  imageAlt = 'Face alignment preview',
  imagePosition = { x: 50, y: 50, scale: 1 },
  imageSrc,
  muted = false,
  onEmptyClick,
  onImagePositionChange,
  onMediaClick,
  showStepIndicator = true,
  stepLabel = 'Step 1 of 3',
  subtitle = 'Center your face in the frame',
  title = 'Look straight ahead',
  videoRef,
}: CaptureFrameProps) {
  const hasMedia = Boolean(imageSrc || videoRef)
  const clickSuppressedRef = useRef(false)
  const dragStateRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startPosition: CaptureFrameImagePosition
  } | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageSrc || !onImagePositionChange) return

    event.currentTarget.setPointerCapture(event.pointerId)
    clickSuppressedRef.current = false
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: imagePosition,
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const rect = event.currentTarget.getBoundingClientRect()
    const deltaX = ((event.clientX - dragState.startClientX) / rect.width) * 100
    const deltaY = ((event.clientY - dragState.startClientY) / rect.height) * 100

    if (Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) > 4) {
      clickSuppressedRef.current = true
    }

    onImagePositionChange?.({
      x: clampPosition(dragState.startPosition.x - deltaX),
      y: clampPosition(dragState.startPosition.y - deltaY),
      scale: dragState.startPosition.scale,
    })
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current
    if (dragState?.pointerId === event.pointerId) {
      dragStateRef.current = null
    }
  }

  function handleClick() {
    if (!hasMedia) {
      onEmptyClick?.()
      return
    }

    if (!clickSuppressedRef.current) {
      onMediaClick?.()
    }
    clickSuppressedRef.current = false
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    handleClick()
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!imageSrc || !onImagePositionChange) return

    event.preventDefault()
    const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08
    onImagePositionChange({
      ...imagePosition,
      scale: clampScale(imagePosition.scale + zoomDelta),
    })
  }

  return (
    <div
      className={`relative mx-auto aspect-[9/16] w-full max-w-[390px] overflow-hidden rounded-[44px] bg-black shadow-2xl ${imageSrc && onImagePositionChange ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${(!hasMedia && onEmptyClick) || (hasMedia && onMediaClick) ? 'cursor-pointer' : ''} ${className}`}
      onClick={(!hasMedia && onEmptyClick) || (hasMedia && onMediaClick) ? handleClick : undefined}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={(!hasMedia && onEmptyClick) || (hasMedia && onMediaClick) ? handleKeyDown : undefined}
      onWheel={handleWheel}
      role={(!hasMedia && onEmptyClick) || (hasMedia && onMediaClick) ? 'button' : undefined}
      tabIndex={(!hasMedia && onEmptyClick) || (hasMedia && onMediaClick) ? 0 : undefined}
    >
      {imageSrc ? (
        <Image
          className="object-cover"
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="min(390px, 100vw)"
          style={{
            objectPosition: `${imagePosition.x}% ${imagePosition.y}%`,
            transform: `scale(${imagePosition.scale})`,
          }}
          draggable={false}
        />
      ) : videoRef ? (
        <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted autoPlay />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-zinc-950">
          <div className="grid justify-items-center gap-3 text-center text-white/65">
            <ImagePlus className="size-9" aria-hidden="true" />
            <p className="max-w-48 text-sm leading-5">Upload or take a front-facing photo</p>
          </div>
        </div>
      )}

      <div className={`absolute inset-0 ${muted ? 'opacity-80' : ''}`}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_35%_at_50%_45%,rgba(0,0,0,0)_0%,rgba(0,0,0,0)_48%,rgba(0,0,0,0.18)_58%,rgba(0,0,0,0.58)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/60 via-black/24 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/72 via-black/42 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/48 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black/48 to-transparent" />
      </div>

      {showStepIndicator ? (
        <div className="pointer-events-none absolute inset-x-0 top-7 grid justify-items-center gap-3 text-white">
          <div className="font-mono text-[13px] font-semibold uppercase tracking-[0.28em] text-white/80">{stepLabel}</div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-12 rounded-full bg-white" />
            <span className="h-1.5 w-12 rounded-full bg-white/25" />
            <span className="h-1.5 w-12 rounded-full bg-white/25" />
          </div>
        </div>
      ) : null}

      <svg className="pointer-events-none absolute left-1/2 top-[45%] h-[54%] w-[80%] -translate-x-1/2 -translate-y-1/2 overflow-visible" viewBox="0 0 260 340" aria-hidden="true">
        <path
          d="M130 9C52 9 14 68 14 162c0 96 42 169 116 169s116-73 116-169C246 68 208 9 130 9Z"
          fill="none"
          stroke="rgba(255,255,255,0.82)"
          strokeDasharray="8 12"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-8 bottom-[17%] text-center text-white">
        <h3 className="text-2xl font-semibold leading-none tracking-[-0.04em] sm:text-3xl">{hasMedia ? title : 'Add your photo'}</h3>
        <p className="mt-3 text-sm font-medium text-white/62 sm:text-base">{hasMedia ? subtitle : 'Use a clear, front-facing image'}</p>
      </div>

      {action ? <div className="absolute inset-x-0 bottom-7 px-8">{action}</div> : null}
    </div>
  )
}

function clampPosition(value: number) {
  return Math.max(0, Math.min(100, value))
}

function clampScale(value: number) {
  return Math.max(1, Math.min(3, Math.round(value * 100) / 100))
}
