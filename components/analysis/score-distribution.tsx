import styles from './score-distribution.module.css'

// Unweighted 2022 GSS interviewer ratings (RLOOKS). The survey reports five categories.
const referenceCounts = [31, 119, 915, 485, 122]
const referenceTotal = referenceCounts.reduce((sum, count) => sum + count, 0)
const referenceShares = referenceCounts.map(count => 100 * count / referenceTotal)
const referencePoints = [[0, 0], ...referenceShares.map((share, index) => [index * 2 + 1, share]), [10, 0]]
const clampScore = (score: number) => Math.max(0, Math.min(10, score))
const baseline = 64

function distributionHeight(score: number) {
  const index = referencePoints.findIndex(([position], index) => index > 0 && position >= score)
  const [left, low] = referencePoints[index - 1]
  const [right, high] = referencePoints[index]
  const progress = (score - left) / (right - left)
  return 5 + 48 * (low + (high - low) * (1 - Math.cos(progress * Math.PI)) / 2) / Math.max(...referenceShares)
}

export function ScoreDistribution({ score, potential, showSurvey = false, compact = false, histogram }: {
  score: number; potential?: number | null; showSurvey?: boolean; compact?: boolean; histogram?: { bins: number[]; count: number }
}) {
  const width = histogram || compact ? 300 : 160
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

  return <figure className={styles.distribution} data-report-histogram={Boolean(histogram) || undefined} aria-label={compact ? `${label}. Current score ${score.toFixed(1)}.${potential != null ? ` Potential ${potential.toFixed(1)}.` : ''}` : label}>
    <svg viewBox={showSurvey || histogram ? `0 0 ${width} ${compact ? 68 : 79}` : '0 41 160 38'} aria-hidden="true">
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
      {!compact && <>
      <text x="5" y="76" textAnchor="middle" className={styles.distributionCaption}>0</text>
      <text x={width - 5} y="76" textAnchor="middle" className={styles.distributionCaption}>10</text>
      </>}
    </svg>
    {histogram && <figcaption className={styles.distributionLegend}>
      <span><i className={styles.currentMark} /> Score {score.toFixed(1)}</span>
      <span>{histogram.count} scores in this report</span>
    </figcaption>}
  </figure>
}

// The five rating categories map to equal bands on the app's score scale.
// Within each category the reference distributes its share evenly.
function referenceRank(score: number) {
  const bandPosition = clampScore(score) / 2
  const band = Math.min(4, Math.floor(bandPosition))
  const before = referenceShares.slice(0, band).reduce((sum, share) => sum + share, 0)
  return before + referenceShares[band] * (bandPosition - band)
}

function scoreAtRank(rank: number) {
  let remaining = rank
  for (const [index, share] of referenceShares.entries()) {
    if (remaining <= share) return (index + remaining / share) * 2
    remaining -= share
  }
  return 10
}

const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' })
function ordinal(rank: number) {
  const value = Math.max(1, Math.min(100, Math.round(rank)))
  const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th', many: 'th', zero: 'th' }[ordinalRules.select(value)]
  return `${value}${suffix}`
}

export function AttractivenessDistribution({ score, potential }: { score: number; potential?: number }) {
  const x = (value: number) => 28 + clampScore(value) * 29.2
  const bottom = 112
  const y = (share: number) => bottom - share * 5.8
  const ticksPerBand = 4
  const shareAt = (value: number) => referenceShares[Math.min(4, Math.floor(clampScore(value) / 2))] / ticksPerBand
  const rank = ordinal(referenceRank(score))
  const potentialRank = potential == null ? null : ordinal(referenceRank(potential))
  const coincident = potential != null && Math.abs(x(potential) - x(score)) < 6

  return <figure className={styles.attractiveness}>
    <div className={styles.attractivenessHeading}>
      <h3>Attractiveness distribution</h3>
      <span>Reference estimate</span>
    </div>
    <div className={styles.attractivenessReadings}>
      <div><span><i />Current</span><strong>{rank}</strong><small> percentile</small></div>
      {potentialRank && <div><span><i />Potential</span><strong>{potentialRank}</strong><small> percentile</small></div>}
    </div>
    <div className={styles.attractivenessAxis}>Share of reference sample</div>
    <svg viewBox="0 0 330 156" role="img" aria-label={`Reference distribution on a 1 to 100 score scale. Current estimate: ${rank} percentile.${potentialRank ? ` Potential estimate: ${potentialRank} percentile.` : ''}`}>
      {[0, 5, 10, 15].map(share => <g key={share}>
        <text x="0" y={y(share)} dominantBaseline="middle" className={styles.attractivenessLabel}>{share}%</text>
        <line x1={x(0)} x2={x(10)} y1={y(share)} y2={y(share)} className={styles.attractivenessGrid} />
      </g>)}
      {Array.from({ length: referenceShares.length * ticksPerBand }, (_, index) => {
        const value = (index + .5) / 2
        return <line key={value} x1={x(value)} x2={x(value)} y1={y(shareAt(value))} y2={bottom}
          className={styles.distributionTick} strokeWidth="4" style={{ animationDelay: `${index * 14}ms` }} />
      })}
      {potential != null && <line x1={x(potential)} x2={x(potential)} y1={coincident ? 9 : y(shareAt(potential)) - 12}
        y2={coincident ? y(shareAt(score)) - 10 : bottom} className={styles.potentialMark} strokeWidth="4" />}
      <line x1={x(score)} x2={x(score)} y1={y(shareAt(score)) - 7} y2={bottom} className={styles.currentMark} strokeWidth="4" />
      {[1, 20, 40, 60, 80, 100].map(label => <text key={label} x={x(label / 10)} y="128" textAnchor="middle"
        className={styles.attractivenessLabel}>{label}</text>)}
      {[25, 50, 75].map(label => <g key={label}>
        <line x1={x(scoreAtRank(label))} x2={x(scoreAtRank(label))} y1="133" y2="139" className={styles.attractivenessQuartile} />
        <text x={x(scoreAtRank(label))} y="152" textAnchor="middle" className={styles.attractivenessLabel}>{ordinal(label)}</text>
      </g>)}
    </svg>
    <figcaption>Score out of 100 · Percentile markers every 25 ranks</figcaption>
  </figure>
}
