import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, SectionTitle } from '@/design/components'
import { useAppState } from '@/app/AppState'
import { REWARD_BY_ID, REWARD_CATEGORY_LABEL, RARITY_LABEL, type Challenge, type RewardCategory } from '@/core/prestigeRewards'
import { prefsService } from '@/data/prefsService'
import { questService } from '@/data/questService'
import r from './rpg.module.css'

const when = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const CATS: RewardCategory[] = ['progression', 'title', 'cosmetic', 'content']

/** Récompenses acquises : bonus permanents, titres, personnalisation (à équiper) et défis facultatifs. */
export function RpgRewardsPanel() {
  const { rewards, rpg, prefs, categories, quests } = useAppState()
  const [added, setAdded] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const addChallenge = async (c: Challenge) => {
    setErr(null)
    try {
      const cat = categories.find((x) => x.id === c.categoryId && !x.archived) ?? categories.find((x) => !x.archived)
      if (!cat) throw new Error('Aucune catégorie LIFE disponible.')
      await questService.createQuest({ type: 'exceptional', title: c.title, description: c.description, categoryId: cat.id, priority: 'low', difficulty: c.difficulty, effortMinutes: c.effortMinutes })
      setAdded(c.id)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ajout impossible.') }
  }
  const owned = rewards.map((x) => ({ row: x, def: REWARD_BY_ID[x.id] })).filter((x) => x.def)
  const bonuses = (['LIFE', 'SPORT'] as const).map((d) => ({ d, pct: rpg.bonus[d], n: owned.filter((o) => o.def.effect.type === 'xp-bonus' && o.def.effect.domain === d).length }))
  return (
    <div className={r.stack}>
      <Card>
        <SectionTitle title="Bonus permanents d’XP" />
        <ul className={r.rows}>
          {bonuses.map((b) => (
            <li key={b.d} className={r.row}><span className={r.grow} style={{ flex: 1 }}><b>{b.d}</b><small>{b.n ? `${b.n} palier${b.n > 1 ? 's' : ''} obtenu${b.n > 1 ? 's' : ''}` : 'Aucun bonus obtenu'} · s’applique uniquement à l’XP {b.d}, à partir du lendemain de l’obtention</small></span><b className="num" style={{ color: 'var(--c-gold-bright)' }}>+{b.pct} %</b></li>
          ))}
        </ul>
        <p className={r.note} style={{ marginTop: 10 }}>Les bonus sont dégressifs (chaque palier apporte moins que le précédent) et n’altèrent jamais l’XP déjà acquise.</p>
      </Card>

      {owned.length === 0 ? (
        <Card variant="flat"><p className={r.muted}>Aucune récompense pour l’instant. Chaque prestige permet d’en choisir une, définitivement. <Link to="/rpg/prestige" style={{ color: 'var(--c-gold)' }}>Voir le prestige</Link></p></Card>
      ) : CATS.map((cat) => {
        const items = owned.filter((o) => o.def.category === cat)
        if (!items.length) return null
        return (
          <Card key={cat}>
            <SectionTitle title={REWARD_CATEGORY_LABEL[cat]} aside={`${items.length}`} />
            <ul className={r.rows}>
              {items.map(({ row, def }) => {
                const e = def.effect
                const equipped = e.type === 'levelup-effect' ? prefs.rpg.effect === def.id : e.type === 'rank-frame' ? prefs.rpg.frame === def.id : false
                return (
                  <li key={def.id} className={`${r.row} ${equipped ? r.on : ''}`}>
                    <span className={r.grow} style={{ flex: 1 }}><b>{def.name}</b><small>{def.description}</small><small>Obtenue le {when(row.acquiredAt)} · {RARITY_LABEL[def.rarity]}{row.prestigeId ? ` · ${row.prestigeId.replace('prestige:', 'prestige ').replace(':', ' n° ')}` : ''}</small>
                      {e.type === 'challenges' ? (
                        <span style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                          {e.challenges.map((c) => {
                            const exists = quests.some((q) => !q.archived && q.title === c.title)
                            return (
                              <span key={c.id} className={r.row} style={{ minHeight: 44 }}>
                                <span className={r.grow} style={{ flex: 1 }}>{c.title}<small>{c.description} · ~{c.effortMinutes} min</small></span>
                                <button className={`${r.btn} ${r.mini}`} disabled={exists || added === c.id} onClick={() => void addChallenge(c)} aria-label={`Ajouter la quête ${c.title}`}>{exists || added === c.id ? 'Ajoutée' : 'Ajouter'}</button>
                              </span>
                            )
                          })}
                        </span>
                      ) : null}
                    </span>
                    {e.type === 'levelup-effect' || e.type === 'rank-frame' ? (
                      <button className={`${r.btn} ${r.mini}`} aria-pressed={equipped} onClick={() => void prefsService.update((p) => ({ ...p, rpg: { ...p.rpg, ...(e.type === 'levelup-effect' ? { effect: equipped ? null : def.id } : { frame: equipped ? null : def.id }) } }))}>{equipped ? 'Retirer' : 'Équiper'}</button>
                    ) : e.type === 'title' ? <Link to="/rpg/distinctions" className={`${r.btn} ${r.mini} ${r.ghost}`}>Titres</Link> : <Badge tone="gold">{RARITY_LABEL[def.rarity]}</Badge>}
                  </li>
                )
              })}
            </ul>
            {cat === 'content' ? <p className={r.note} style={{ marginTop: 10 }}>Facultatif : un défi ajouté devient une vraie quête LIFE, avec son XP habituel. Aucun contenu ne conditionne la progression.</p> : null}
          </Card>
        )
      })}
      {err ? <p className={r.err} role="alert">{err}</p> : null}
    </div>
  )
}
