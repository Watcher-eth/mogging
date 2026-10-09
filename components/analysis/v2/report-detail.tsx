import { ReportCategoryHeader, ReportColorPalette, type DesktopReportCategory } from '../analysis-report'
import { layoutWebRubrics, type WebRubricGroup } from '@/lib/analysis-v2/web-report'
import { RubricVisual } from './rubric-visual'
import styles from './rubrics.module.css'

export function V2ReportDetail({ category, groups }: { category: DesktopReportCategory; groups: WebRubricGroup[] }) {
  const rubrics = layoutWebRubrics(groups.flatMap(group => group.rubrics))
  return <div className={`${styles.groups} ${styles.enter}`} key={category.id}>
    <ReportCategoryHeader category={category} simplified />
    {category.id === 'eyes' && category.eyeColor && <div className="mt-3"><ReportColorPalette color={category.eyeColor} ribbon /></div>}
    {category.id === 'hair' && category.hairColor && <div className="mt-3"><ReportColorPalette color={category.hairColor} kind="hair" ribbon /></div>}
    <div className={`${styles.grid} mt-3`}>{rubrics.map(({ rubric, full }) => <div key={rubric.id} data-rubric={rubric.id} className={`flex min-h-0 flex-col justify-between border bg-white p-4 ${full ? styles.full : ''} ${rubric.visual === 'Orbit' ? full ? styles.orbitFull : styles.orbitHalf : ''}`}>
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{rubric.label}</p>
      {rubric.visual === 'Text' ? <div className="pt-10"><p className="text-xl font-semibold tracking-[-0.04em]">{rubric.value}</p></div> : <>
        <RubricVisual kind={rubric.visual} positions={rubric.positions} grade={rubric.grade} scale={rubric.scale} />
        <p className={`${styles.valueRow} mt-4 text-xl font-semibold tabular-nums tracking-[-0.04em]`}>{rubric.value}{rubric.visual === 'Rail' && rubric.grade !== null && <span className="shrink-0 text-xl font-semibold text-muted-foreground">{rubric.grade.toFixed(1)} / 10</span>}</p>
      </>}
    </div>)}</div>
    <div className="mt-3 border bg-white p-4"><p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Explanation</p><p className="mt-10 text-sm leading-6 text-muted-foreground">{category.explanation}</p></div>
  </div>
}
