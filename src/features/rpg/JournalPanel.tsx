import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState, SectionTitle } from '@/design/components'
import { Icon, type IconName } from '@/design/Icon'
import { useAppState } from '@/app/AppState'
import { narrateEvent } from '@/core/narration'
import { IMPORTANCE_LABEL, JOURNAL_FILTERS, matchesFilter, type JournalFilter, type RpgEvent } from '@/core/rpgEvents'
import { eventService } from '@/data/eventService'
import r from './rpg.module.css'

const PAGE = 30
const ICON: Record<string, IconName> = { progression: 'rpg', life: 'life', sport: 'sport', regularity: 'history' }
const TONE = { info: 'neutral', important: 'gold', major: 'gold', exceptional: 'gold' } as const
const month = (iso: string) => { const d = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1) }
const when = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Journal chronologique des moments importants : sans limitation d'ancienneté, jamais supprimé après consultation. */
export function JournalPanel() {
  const { rpgEvents } = useAppState()
  const [filter, setFilter] = useState<JournalFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(() => rpgEvents.filter((e) => matchesFilter(e, filter)), [rpgEvents, filter])
  const unseen = rpgEvents.filter((e) => !e.seenAt && !e.revokedAt).length
  const visible = list.slice(0, shown)
  const groups: Array<[string, RpgEvent[]]> = []
  for (const e of visible) { const k = month(e.at); const g = groups[groups.length - 1]; if (g && g[0] === k) g[1].push(e); else groups.push([k, [e]]) }

  if (rpgEvents.length === 0) return <EmptyState title="Le journal est encore vide">Les moments qui comptent (niveaux, rangs, succès, objectifs atteints, records…) s’inscriront ici, avec leur date, et resteront consultables des années plus tard. Une action ordinaire n’y apparaît jamais.</EmptyState>
  return (
    <div className={r.stack}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className={r.chips} role="group" aria-label="Filtrer le journal">
          {JOURNAL_FILTERS.map(([k, label]) => <button key={k} className={r.chip} aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(PAGE) }}>{label}</button>)}
        </div>
        {unseen > 0 ? <button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void eventService.markAllSeen()}>Tout marquer comme consulté ({unseen})</button> : null}
      </div>
      <p className={r.sectionHint}>{list.length} moment{list.length > 1 ? 's' : ''} · l’historique n’est jamais effacé, même consulté.</p>
      {list.length === 0 ? <Card variant="flat"><p className={r.muted}>Aucun moment dans cette catégorie pour l’instant.</p></Card> : null}
      {groups.map(([m, items]) => (
        <section key={m} aria-label={m}>
          <h3 className={r.month}>{m}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((e) => {
              const n = narrateEvent(e)
              const isOpen = open === e.id
              return (
                <button key={e.id} className={`${r.entry} ${r[`imp_${e.importance}`]} ${!e.seenAt && !e.revokedAt ? r.fresh : ''} ${e.revokedAt ? r.revoked : ''}`} aria-expanded={isOpen} aria-label={`${e.title} — ${IMPORTANCE_LABEL[e.importance]}${!e.seenAt && !e.revokedAt ? ' — nouveau' : ''}`}
                  onClick={() => { setOpen(isOpen ? null : e.id); if (!e.seenAt) void eventService.markSeen(e.id) }}>
                  <span className={r.entryTop}>
                    <span className={r.entryIcon}><Icon name={ICON[e.category] ?? 'rpg'} size={18} /></span>
                    <span className={r.entryHead}><b>{e.title}</b><small>{when(e.at)} · {e.domain === 'MIXED' ? 'LIFE + SPORT' : e.domain === 'RPG' ? 'RPG' : e.domain}</small></span>
                  </span>
                  <span className={r.entryBody}>{n.body}</span>
                  <span className={r.entryMeta}>
                    <Badge tone={TONE[e.importance]}>{IMPORTANCE_LABEL[e.importance]}</Badge>
                    {e.revokedAt ? <span className={r.tagChip}>Corrigé : le fait n’est plus valide</span> : null}
                    {e.backfill ? <span className={r.tagChip}>Historique reconstitué</span> : null}
                  </span>
                  {isOpen ? (
                    <span style={{ display: 'grid', gap: 6 }}>
                      <span className={r.entryBody} style={{ color: 'var(--c-gold)', fontStyle: 'italic' }}>{n.headline}</span>
                      <span className={r.entryBody}>{e.description}</span>
                      {e.route ? <Link to={e.route} className={`${r.btn} ${r.mini}`} style={{ justifySelf: 'start' }} onClick={(ev) => ev.stopPropagation()}>Ouvrir</Link> : null}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {list.length > shown ? <button className={`${r.btn} ${r.ghost}`} onClick={() => setShown(shown + PAGE)}>Afficher plus ({list.length - shown} restants)</button> : null}
      <SectionTitle title="" />
    </div>
  )
}
