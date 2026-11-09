import { ArrowRight, LockKeyhole } from 'lucide-react'
import { basicCategories, type BasicReport as Report } from '@/lib/analysis-v2/basic-preview'

export function BasicReport({ report, onUpgrade, canUpgrade }: { report: Report; onUpgrade: () => void; canUpgrade: boolean }) {
  return <div className="public-gutters basic-report">
    <header>
      <div><p className="assessment-kicker">Basic · Private report</p><h1>Your first look.</h1>
        <p>One finding per category from your photos.</p></div>
      <button type="button" className="assessment-primary" onClick={onUpgrade}>{canUpgrade ? 'Unlock the full report' : 'Add photos to upgrade'} <ArrowRight size={16} /></button>
    </header>
    <div className="basic-report-grid">
      {basicCategories.map(category => <section key={category.id}>
        <h2>{category.title}</h2>
        <dl>
          <div><dt>{category.metric.name}</dt><dd>{report.values[category.metric.id] ?? 'Not available'}</dd></div>
          {category.locked.map(name => <div key={name}><dt>{name}</dt><dd><span aria-hidden="true">— —</span><LockKeyhole size={12} aria-label="Locked" /></dd></div>)}
        </dl>
      </section>)}
    </div>
  </div>
}
