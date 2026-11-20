import { Card, ProgressBar, SectionTitle } from '@/design/components'
import { RadarChart } from '@/design/charts'
import { useAppState } from '@/app/AppState'
import { ATTRIBUTE_HINTS, LIFE_ATTRIBUTE_IDS, SPORT_ATTRIBUTE_IDS, TRANSVERSAL_ATTRIBUTE_IDS } from '@/core/attributes'
import { xpByAttribute } from '@/core/ledger'
import r from './rpg.module.css'

/** Attributs LIFE et SPORT : valeurs recalculées depuis le journal, avec ce qui les fait évoluer. Jamais réinitialisés par un prestige. */
export function AttributesPanel() {
  const { progress, events } = useAppState()
  const xp = xpByAttribute(events)
  const group = (ids: string[], title: string, aside: string) => (
    <Card>
      <SectionTitle title={title} aside={aside} />
      <div style={{ display: 'grid', placeItems: 'center' }}><RadarChart attributes={progress.attributes.filter((a) => ids.includes(a.id))} /></div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {progress.attributes.filter((a) => ids.includes(a.id)).map((a) => (
          <div key={a.id} className={r.attr} style={{ rowGap: 2 }}>
            <span>{a.label}{TRANSVERSAL_ATTRIBUTE_IDS.includes(a.id) ? ' ⇄' : ''}</span>
            <ProgressBar value={a.value / 100} thin label={a.label} />
            <span className="num">{a.value}</span>
            <span className={r.attrHint}>{ATTRIBUTE_HINTS[a.id]} · {xp[a.id] ?? 0} XP</span>
          </div>
        ))}
      </div>
    </Card>
  )
  return (
    <div className={r.stack}>
      <p className={r.note}>Un attribut évolue uniquement avec des actions réellement accomplies (quêtes, séances) ; il se recalcule depuis le journal d’XP, donc une correction le met à jour. ⇄ : attribut partagé par LIFE et SPORT. Le prestige ne les réinitialise jamais.</p>
      <div className={r.grid2}>
        {group(LIFE_ATTRIBUTE_IDS, 'Attributs LIFE', 'un par catégorie')}
        {group(SPORT_ATTRIBUTE_IDS, 'Attributs SPORT', '7 attributs')}
      </div>
    </div>
  )
}
