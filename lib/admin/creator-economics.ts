export type FunnelMetrics = {
  qualifiedViews: number
  linkClicks: number
  installs: number
  firstTimePaidCustomers: number
}

export type EconomicsPayment = {
  amountCents: number
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled'
}

export type EconomicsSettings = {
  ninetyDayContributionMarginCents: number
  compensationCapRate: number
  conversionBonusCapRate: number
}

const committedStatuses = new Set<EconomicsPayment['status']>(['pending', 'processing', 'paid'])

export function calculateCreatorEconomics(
  metrics: FunnelMetrics,
  payments: EconomicsPayment[],
  settings: EconomicsSettings
) {
  const committedCompensationCents = payments.reduce(
    (total, payment) => total + (committedStatuses.has(payment.status) ? payment.amountCents : 0),
    0
  )
  const paidCompensationCents = payments.reduce(
    (total, payment) => total + (payment.status === 'paid' ? payment.amountCents : 0),
    0
  )
  const attributableMarginCents = metrics.firstTimePaidCustomers * settings.ninetyDayContributionMarginCents
  const compensationCapCents = Math.floor(attributableMarginCents * settings.compensationCapRate)
  const contributionAfterCompensationCents = attributableMarginCents - committedCompensationCents

  return {
    ...metrics,
    linkCtr: divide(metrics.linkClicks, metrics.qualifiedViews),
    clickToInstallConversion: divide(metrics.installs, metrics.linkClicks),
    installToPaidConversion: divide(metrics.firstTimePaidCustomers, metrics.installs),
    viewToPaidConversion: divide(metrics.firstTimePaidCustomers, metrics.qualifiedViews),
    attributableMarginCents,
    compensationCapCents,
    committedCompensationCents,
    paidCompensationCents,
    contributionAfterCompensationCents,
    compensationShare: divide(committedCompensationCents, attributableMarginCents),
    sustainableRpmCents: metrics.qualifiedViews > 0
      ? Math.floor((compensationCapCents / metrics.qualifiedViews) * 1000)
      : 0,
    actualRpmCents: metrics.qualifiedViews > 0
      ? Math.round((committedCompensationCents / metrics.qualifiedViews) * 1000)
      : 0,
    creatorCacCents: metrics.firstTimePaidCustomers > 0
      ? Math.round(committedCompensationCents / metrics.firstTimePaidCustomers)
      : 0,
    ninetyDayRoas: divide(attributableMarginCents, committedCompensationCents),
    maxConversionBonusCents: Math.floor(
      settings.ninetyDayContributionMarginCents * settings.conversionBonusCapRate
    ),
    isWithinCompensationCap: committedCompensationCents <= compensationCapCents,
  }
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0
}
