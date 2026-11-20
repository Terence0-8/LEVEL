import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Card, PageHeader, SectionTitle } from '@/design/components'
import { Segmented, smallBtn } from '@/design/Form'
import { Icon } from '@/design/Icon'
import sheet from '@/design/sheet.module.css'
import { buildReport, reportFileName, shiftAnchor, type ReportKind } from '@/core/reports'
import { renderReportPdf } from '@/core/reports/pdf'
import s from './ReportsPage.module.css'

/** Bilans consultables dans l'application, exportables en PDF. Un PDF de bilan n'est PAS une sauvegarde. */
export function ReportsPage() {
  const { events, quests, categories, sport, analyses, moves, commitments, now, demo } = useAppState()
  const [kind, setKind] = useState<ReportKind>('day')
  const [anchor, setAnchor] = useState(() => now)
  const [done, setDone] = useState<string | null>(null)

  const report = useMemo(() => buildReport({
    kind, anchor, now, events, quests, categories, sessions: sport.sessions, checks: sport.checks, analyses, moves, commitments,
    recovery: sport.recovery, sportTarget: sport.profile.availability.strengthPerWeek,
  }), [kind, anchor, now, events, quests, categories, sport, analyses, moves, commitments])

  const exportPdf = () => {
    const blob = new Blob([renderReportPdf(report) as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = reportFileName(report)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    setDone(a.download)
  }

  return (
    <div className={s.wrap}>
      <PageHeader title="Bilans" subtitle="Un regard clair sur ce qui était prévu, ce qui a été fait et la suite." />
      {demo ? <p className={s.note}>Les données de démonstration sont affichées ailleurs : les bilans reposent uniquement sur vos données réelles.</p> : null}
      <div className={s.bar}>
        <Segmented<ReportKind> label="Type de bilan" value={kind} onChange={(k) => { setKind(k); setAnchor(now); setDone(null) }} options={[{ value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }]} />
        <div className={s.nav}>
          <button className={smallBtn} onClick={() => setAnchor(shiftAnchor(kind, anchor, -1))} aria-label="Période précédente">←</button>
          <div className={s.label}>{report.subtitle}</div>
          <button className={smallBtn} onClick={() => setAnchor(shiftAnchor(kind, anchor, 1))} aria-label="Période suivante">→</button>
        </div>
      </div>
      <div className={s.export} style={{ justifySelf: 'end' }}>
        <button className={sheet.btnPrimary} onClick={exportPdf}><Icon name="download" size={16} /> Exporter ce bilan en PDF</button>
        <small>{done ? `${done} enregistré. ` : ''}Document à lire ou à partager ; ce n’est pas une sauvegarde.</small>
      </div>

      <div className={s.doc} aria-live="polite">
        {report.sections.map((sec) => {
          const hasContent = Boolean(sec.stats?.length || sec.table?.rows.length || sec.lines?.length)
          return (
            <Card key={sec.id}>
              <SectionTitle title={sec.title} />
              {sec.stats?.length ? (
                <div className={s.stats}>{sec.stats.map((st) => <div key={st.label} className={s.stat}><span>{st.label}</span><b className="num">{st.value}</b>{st.hint ? <small>{st.hint}</small> : null}</div>)}</div>
              ) : null}
              {sec.table?.rows.length ? (
                <table className={s.table}>
                  <thead><tr>{sec.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{sec.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
              ) : null}
              {sec.lines?.length ? <ul className={s.lines}>{sec.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
              {!hasContent ? <p className={s.empty}>{sec.empty ?? 'Rien à signaler.'}</p> : null}
            </Card>
          )
        })}
        <p className={s.note}>{report.note}</p>
      </div>
    </div>
  )
}
