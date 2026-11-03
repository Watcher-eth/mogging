import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { SkeletonBox } from 'skullet/react'

type SkeletonImageProps = Omit<ImageProps, 'fill' | 'width' | 'height'>

// The positioned parent reserves the image dimensions.
export function ImageSkeleton() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 block leading-none">
      <SkeletonBox width="100%" height="100%" radius="0" />
    </span>
  )
}

export function SkeletonImage(props: SkeletonImageProps) {
  const source = typeof props.src === 'string' ? props.src : 'default' in props.src ? props.src.default.src : props.src.src
  return <LoadingImage key={source} {...props} />
}

function LoadingImage({ alt, onLoad, onError, ...props }: SkeletonImageProps) {
  const [settled, setSettled] = useState(false)

  return (
    <>
      {!settled && <ImageSkeleton />}
      <Image
        {...props}
        alt={alt}
        fill
        onLoad={(event) => {
          setSettled(true)
          onLoad?.(event)
        }}
        onError={(event) => {
          setSettled(true)
          onError?.(event)
        }}
      />
    </>
  )
}
