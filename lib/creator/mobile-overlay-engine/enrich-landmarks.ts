import type { FaceContourKey, FaceLandmarkContours, FaceLandmarksPayload, NormalizedPoint } from './landmarks'

const validPoint=(point:NormalizedPoint)=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1

// Validate detector geometry without resampling away corners, thickness or topology.
export function enrichFaceLandmarks(landmarks:FaceLandmarksPayload|null):FaceLandmarksPayload|null {
  if(!landmarks)return null
  const anchors=Object.fromEntries(Object.entries(landmarks.anchors).filter(([,point])=>point&&validPoint(point)))
  if(!anchors.mouthCenter&&anchors.mouthLeft&&anchors.mouthRight)anchors.mouthCenter={x:(anchors.mouthLeft.x+anchors.mouthRight.x)/2,y:(anchors.mouthLeft.y+anchors.mouthRight.y)/2}
  const contours:FaceLandmarkContours={}
  for(const [key,points] of Object.entries(landmarks.contours??{})){
    if(points&&points.length>=2&&points.every(validPoint))contours[key as FaceContourKey]=points
  }
  return {...landmarks,anchors,contours}
}
