import { useState } from 'react'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Icon } from '@/design/Icon'
import { useAppState } from '@/app/AppState'
import { ACHIEVEMENTS } from '@/core/achievements'
import { RARITY_LABEL } from '@/core/prestigeRewards'
import { prefsService } from '@/data/prefsService'
import r from './rpg.module.css'

const when = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const RARITY_TONE = { common: 'neutral', rare: 'info', epic: 'gold', legendary: 'gold' } as const

/** Succès (verrouillés / débloqués avec leur date), titres affichables. */
export function DistinctionsPanel() {
  const { achievements, rpg } = useAppState()
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all')
  const got = new Map(achievements.map((a) => [a.id, a.unlockedAt]))
  const list = ACHIEVEMENTS.filter((a) => filter === 'all' || (filter === 'on') === got.has(a.id))
  return (
    <div className={r.stack}>
      <Card>
        <SectionTitle title="Titre affiché" aside={rpg.titles.length ? `${rpg.titles.length} disponible${rpg.titles.length > 1 ? 's' : ''}` : undefined} />
        {rpg.titles.length === 0 ? <p className={r.muted}>Aucun titre pour l’instant. Les titres viennent de certains succès et des récompenses de prestige.</p> : (
          <ul className={r.rows}>
            <li className={`${r.row} ${!rpg.equippedTitle ? r.on : ''}`}><span className="grow" style={{ flex: 1 }}>Aucun titre</span><button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void prefsService.update((p) => ({ ...p, rpg: { ...p.rpg, title: null } }))}>Choisir</button></li>
            {rpg.titles.map((t) => (
              <li key={t.id} className={`${r.row} ${rpg.equippedTitle === t.id ? r.on : ''}`}>
                <span className={r.grow} style={{ flex: 1 }}><b>{t.title}</b><small>{t.source}</small></span>
                <button className={`${r.btn} ${r.mini}`} aria-pressed={rpg.equippedTitle === t.id} onClick={() => void prefsService.update((p) => ({ ...p, rpg: { ...p.rpg, title: t.id } }))}>{rpg.equippedTitle === t.id ? 'Affiché' : 'Afficher'}</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <SectionTitle title="Succès" aside={`${got.size} / ${ACHIEVEMENTS.length}`} />
        <div className={r.chips} role="group" aria-label="Filtrer les succès" style={{ marginBottom: 12 }}>
          {([['all', 'Tous'], ['on', 'Débloqués'], ['off', 'À débloquer']] as const).map(([k, l]) => <button key={k} className={r.chip} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <ul className={r.rows}>
          {list.map((a) => {
            const at = got.get(a.id)
            return (
              <li key={a.id} className={`${r.row} ${r[a.rarity]} ${at ? '' : r.locked}`} aria-label={`${a.title} : ${at ? 'débloqué' : 'verrouillé'}`}>
                <span className={r.medal}><Icon name={at ? 'rpg' : 'lock'} size={20} /></span>
                <span className={r.grow} style={{ flex: 1 }}><b>{a.title}</b><small>{a.description}</small><small>{at ? `Obtenu le ${when(at)}` : 'Verrouillé'}{a.grantsTitle ? ` · titre « ${a.grantsTitle} »` : ''}</small></span>
                <Badge tone={RARITY_TONE[a.rarity]}>{RARITY_LABEL[a.rarity]}</Badge>
              </li>
            )
          })}
        </ul>
        <p className={r.note} style={{ marginTop: 12 }}>Les succès reposent sur des données vérifiables et ne récompensent ni la suractivité ni les micro-tâches. Une fois débloqués, ils sont conservés avec leur date.</p>
      </Card>
    </div>
  )
}
