// PSL and Mogging overall are distinct scales. Convert only at the boundary;
// report category scores are already on the 0–10 display scale.
export function clampPslScore(score: number) {
  return Math.max(1, Math.min(8, Math.round(score * 10) / 10))
}

export function pslToOverallScore(pslScore: number) {
  return Math.round((clampPslScore(pslScore) / 8) * 100) / 10
}
