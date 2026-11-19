import { Badge, Card, DemoTag, Notice, PageHeader, ProgressBar, SectionTitle, Stat } from '@/design/components'
import { Ring } from '@/design/charts'
import { Icon } from '@/design/Icon'
import { DemoGate } from '../shared/DemoGate'
import s from '../pages.module.css'

export function SportDemo() {
  return (
    <div className={s.stack}>
      <PageHeader title="SPORT (démo)" subtitle="Données fictives de démonstration : désactivez-les dans le profil pour utiliser le vrai module." />
      <Notice title="Données de démonstration">cet écran est fictif et isolé du vrai module SPORT.</Notice>
      <DemoGate>
        {({ sport, sportLevel }) => (
          <div className={s.grid2}>
            <Card>
              <SectionTitle title="Séances à venir" aside={<DemoTag />} />
              {sport.sessions.map((x) => (
                <div key={x.id} className={s.session}>
                  <span className={s.ico}><Icon name={x.kind === 'Course' ? 'route' : 'dumbbell'} /></span>
                  <div className={s.grow}><b>{x.name}</b><small>{x.when} · {x.focus}</small></div>
                  <Badge tone="info">{x.duration} min</Badge>
                </div>
              ))}
            </Card>
            <Card>
              <SectionTitle title="Récupération" aside={<DemoTag />} />
              <div className={s.center} style={{ marginBottom: 14 }}>
                <Ring progress={sport.recovery / 100} size={120} tone="success" label={`Récupération ${sport.recovery} %`}>
                  <div style={{ fontFamily: 'var(--font-title)', fontSize: 28 }}>{sport.recovery}</div>
                  <div style={{ fontSize: 10, color: 'var(--c-text-dim)', letterSpacing: '0.2em' }}>%</div>
                </Ring>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {sport.recoveryFactors.map((f) => (
                  <div key={f.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 5 }}><span>{f.label}</span><span className="num">{f.value}</span></div>
                    <ProgressBar value={f.value / 100} tone="success" thin label={f.label} />
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionTitle title="Cette semaine" aside={<DemoTag />} />
              <div className={s.kv}>
                <Stat value={`${sport.weekDone}/${sport.weekGoal}`} label="Séances" />
                <Stat value={`${sport.weekKm} km`} label="Course" />
                <Stat value={`Niv. ${sportLevel.level}`} label="SPORT" />
              </div>
              <div style={{ marginTop: 16 }}><ProgressBar value={sport.weekKm / sport.weekKmGoal} tone="info" label="Objectif kilométrique" /></div>
            </Card>
          </div>
        )}
      </DemoGate>
    </div>
  )
}
