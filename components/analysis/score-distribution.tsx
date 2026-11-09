import styles from './score-distribution.module.css'

// The NORC RLOOKS shares supply the reference shape. The 0–10 axis is the app score scale.
const referencePoints = [[0, 0], [1, 1.9], [3, 7.1], [5, 54.7], [7, 29], [9, 7.3], [10, 0]]
const clampScore = (score: number) => Math.max(0, Math.min(10, score))
const baseline = 64

function distributionHeight(score: number) {
  const index = referencePoints.findIndex(([position], index) => index > 0 && position >= score)
  const [left, low] = referencePoints[index - 1]
  const [right, high] = referencePoints[index]
  const progress = (score - left) / (right - left)
  return 5 + 48 * (low + (high - low) * (1 - Math.cos(progress * Math.PI)) / 2) / 54.7
}

export function ScoreDistribution({ score, potential, showSurvey = false, histogram }: {
  score: number; potential?: number | null; showSurvey?: boolean; histogram?: { bins: number[]; count: number }
}) {
  const width = histogram ? 300 : 160
  const scorePosition = (score: number) => 5 + score * (width - 10) / 10
  const peakCount = histogram ? Math.max(1, ...histogram.bins) : 1
  const countHeight = (count: number) => count > 0 ? 6 + 46 * count / peakCount : 3
  const marker = (value: number) => {
    const score = clampScore(value)
    const height = histogram ? countHeight(histogram.bins[Math.min(9, Math.floor(score))]) : showSurvey ? distributionHeight(score) : 13
    return { x: scorePosition(score), y: baseline - Math.max(18, height + 5) }
  }
  const current = marker(score)
  const target = potential != null ? marker(potential) : null
  const ticks = histogram ? histogram.bins.map((count, index) => ({ value: index + .5, height: countHeight(count) }))
    : Array.from({ length: 21 }, (_, tick) => ({ value: tick / 2, height: showSurvey ? distributionHeight(tick / 2) : tick % 4 === 0 ? 9 : 5 }))
  const label = histogram ? `Score distribution across ${histogram.count} results. ${histogram.bins.flatMap((count, i) => count ? [`${i} to ${i + 1}: ${count}`] : []).join(', ')}`
    : showSurvey ? 'Illustrative score distribution' : 'Score scale'

  return <figure className={styles.distribution} data-report-histogram={Boolean(histogram) || undefined} aria-label={label}>
    <svg viewBox={showSurvey || histogram ? `0 0 ${width} 79` : '0 41 160 38'} aria-hidden="true">
      <path d={`M5 64H${width - 5}`} className={styles.distributionBaseline} />
      {ticks.map(({ value, height }, tick) => {
        const x = scorePosition(value)
        return <line key={tick} x1={x} x2={x} y1={baseline - height} y2={baseline} className={styles.distributionTick}
          strokeWidth={histogram ? 2 : 1.5 + height / 53 * 1.1}
          style={{ animationDelay: `${tick * 15}ms` }} />
      })}
      {target !== null && <g className={styles.potentialMark}>
        <line x1={current.x} x2={target.x} y1={baseline} y2={baseline} strokeWidth="1.5" />
        <line x1={target.x} x2={target.x} y1={target.y} y2={baseline} strokeWidth="8" className={styles.potentialPulse} />
        <line x1={target.x} x2={target.x} y1={target.y} y2={baseline} strokeWidth="2.5" />
        <circle cx={target.x} cy={target.y - 3} r="1.3" fill="currentColor" stroke="none" />
      </g>}
      <line x1={current.x} x2={current.x} y1={current.y} y2={baseline} strokeWidth="2.5" className={styles.currentMark} />
      <text x="5" y="76" textAnchor="middle" className={styles.distributionCaption}>0</text>
      <text x={width - 5} y="76" textAnchor="middle" className={styles.distributionCaption}>10</text>
    </svg>
    {histogram && <figcaption className={styles.distributionLegend}>
      <span><i className={styles.currentMark} /> Score {score.toFixed(1)}</span>
      <span>{histogram.count} scores in this report</span>
    </figcaption>}
  </figure>
}
