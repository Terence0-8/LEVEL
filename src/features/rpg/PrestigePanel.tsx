import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, PageHeader, ProgressBar, SectionTitle } from '@/design/components'
import { useAppState } from '@/app/AppState'
import { prestigesOf, PRESTIGE_KEEPS, prestigeResets, type PrestigeRecord } from '@/core/prestige'
import { proposeRewards, REWARD_CATEGORY_LABEL, RARITY_LABEL, REWARD_BY_ID } from '@/core/prestigeRewards'
import { DOMAIN_LADDER, RANK_TITLES, domainXpToMax, xpScaleForCycle } from '@/core/progressionConfig'
import { rpgService, RpgError } from '@/data/rpgService'
import { formatNumber } from '@/lib/format'
import type { Domain } from '@/core/types'
import r from './rpg.module.css'

const when = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const pctMore = (scale: number) => Math.round((scale - 1) * 100)

/** Prestige : disponibilité de chaque domaine et historique (indépendant pour LIFE et SPORT). */
export function PrestigePanel() {
  const { rpg, prestiges } = useAppState()
  return (
    <div className={r.stack}>
      <p className={r.note}>Le prestige est toujours facultatif : au dernier niveau, vous pouvez continuer à progresser aussi longtemps que vous le souhaitez. Il n’a jamais lieu automatiquement et il est propre à chaque domaine.</p>
      <div className={r.grid2}>
        {(['LIFE', 'SPORT'] as const).map((d) => {
          const c = rpg.cycles[d]
          const toMax = Math.max(0, c.xpToMax - c.cycleXp)
          return (
            <Card key={d} variant={c.eligible ? 'event' : 'default'}>
              <SectionTitle title={`Prestige ${d}`} aside={`×${c.prestigeCount}`} />
              <div className={r.domainHead}><span className={r.big}>Niv. {c.level.level}</span><span>rang {c.rank.rank} · {c.rank.title}</span></div>
              <p className={r.muted} style={{ margin: '6px 0 10px' }}>Cycle {c.cycle} · {formatNumber(c.cycleXp)} XP dans ce cycle</p>
              <ProgressBar value={Math.min(1, c.cycleXp / c.xpToMax)} tone={c.eligible ? 'event' : 'gold'} label={`Progression du cycle ${d} vers le dernier niveau`} />
              {c.eligible ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                  <p>Dernier niveau du rang SSS atteint. Le prestige {d} n° {c.nextNumber} est disponible.</p>
                  <Link to={`/rpg/prestige/${d}`} className={r.btn}>Préparer le prestige {d}</Link>
                </div>
              ) : <p className={r.muted} style={{ marginTop: 10 }}>Il reste environ {formatNumber(toMax)} XP pour atteindre le niveau {DOMAIN_LADDER.maxLevel} (rang SSS) et débloquer le prestige.</p>}
            </Card>
          )
        })}
      </div>
      <History prestiges={prestiges} />
    </div>
  )
}

function History({ prestiges }: { prestiges: PrestigeRecord[] }) {
  return (
    <div className={r.grid2}>
      {(['LIFE', 'SPORT'] as const).map((d) => {
        const list = prestigesOf(prestiges, d).reverse()
        return (
          <Card key={d}>
            <SectionTitle title={`Historique ${d}`} aside={`${list.length}`} />
            {list.length === 0 ? <p className={r.muted}>Aucun prestige {d} pour l’instant.</p> : (
              <ul className={r.rows}>
                {list.map((p) => (
                  <li key={p.id} className={r.row} style={{ alignItems: 'flex-start' }}>
                    <span className={r.grow} style={{ flex: 1 }}>
                      <b>Prestige n° {p.number} · {when(p.at)}</b>
                      <small>Avant : niveau {p.levelBefore}, rang {p.rankBefore} · cycle {p.cycle} · {formatNumber(p.cycleXp)} XP</small>
                      <small>Récompense : {p.rewardName ?? 'aucune (catalogue épuisé)'}{p.bonusGainedPct ? ` · bonus +${p.bonusGainedPct} % d’XP ${d}` : ''}</small>
                      <small>Nouveau cycle : XP requise ×{p.nextXpScale} (+{pctMore(p.nextXpScale)} %) · {formatNumber(p.nextXpToMax)} XP jusqu’au dernier niveau</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/** Écran dédié à la confirmation d'un prestige : conséquences, récompenses proposées, confirmation explicite. */
export function PrestigeConfirmPage() {
  const { domain: raw } = useParams()
  const navigate = useNavigate()
  const { rpg, rewards, demo } = useAppState()
  const domain = (raw === 'SPORT' ? 'SPORT' : raw === 'LIFE' ? 'LIFE' : null) as Domain | null
  const [choice, setChoice] = useState<string | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PrestigeRecord | null>(null)

  if (!domain || demo) return <div className={r.stack}><PageHeader title="Prestige" /><p className={r.muted}>Domaine inconnu ou démonstration active. <Link to="/rpg/prestige" style={{ color: 'var(--c-rpg)' }}>Retour</Link></p></div>
  const c = rpg.cycles[domain]
  const proposals = proposeRewards(domain, c.nextNumber, new Set(rewards.map((x) => x.id)))
  const nextScale = xpScaleForCycle(c.cycle + 1)

  if (!c.eligible && !done) {
    return <div className={r.stack}><PageHeader title={`Prestige ${domain}`} /><Card><p className={r.muted}>Le prestige {domain} n’est pas disponible : il faut atteindre le dernier niveau du rang SSS. <Link to="/rpg/prestige" style={{ color: 'var(--c-rpg)' }}>Retour</Link></p></Card></div>
  }

  const confirm = async () => {
    setBusy(true); setError(null)
    try { setDone(await rpgService.prestige(domain, choice)) }
    catch (e) { setError(e instanceof RpgError ? e.message : 'Le prestige n’a pas pu être enregistré. Rien n’a été modifié.'); setBusy(false) }
  }

  return (
    <div className={r.stack}>
      <PageHeader title={`Prestige ${domain} n° ${c.nextNumber}`} subtitle="Un nouveau cycle, sans rien perdre de votre histoire." />
      <Card variant="event">
        <SectionTitle title="Votre position actuelle" />
        <div className={r.domainHead}><span className={r.big}>Niveau {c.level.level}</span><span>rang {c.rank.rank} · {c.rank.title}</span></div>
        <p className={r.muted} style={{ marginTop: 6 }}>Cycle {c.cycle} · {formatNumber(c.cycleXp)} XP dans ce cycle · {formatNumber(c.totalXp)} XP {domain} au total.</p>
      </Card>
      <div className={r.cols}>
        <Card>
          <SectionTitle title="Ce qui est conservé" />
          <ul className={`${r.list} ${r.keep}`}>{PRESTIGE_KEEPS.map((k) => <li key={k}>{k}</li>)}</ul>
        </Card>
        <Card>
          <SectionTitle title="Ce qui est réinitialisé" />
          <ul className={`${r.list} ${r.reset}`}>{prestigeResets(domain).map((k) => <li key={k}>{k}</li>)}</ul>
          <h3 style={{ fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-dim)', margin: '14px 0 4px' }}>Nouveau fonctionnement</h3>
          <ul className={r.list}>
            <li>Chaque niveau du {domain} demande {pctMore(nextScale)} % d’XP en plus (×{nextScale}) ; le dernier niveau demande {formatNumber(domainXpToMax(c.cycle + 1))} XP.</li>
            <li>Aucun effet sur la difficulté de vos quêtes, séances ou objectifs.</li>
            <li>Niveau global et autre domaine inchangés.</li>
          </ul>
        </Card>
      </div>
      <Card>
        <SectionTitle title="Choisissez une récompense majeure" aside="choix définitif" />
        {proposals.length === 0 ? <p className={r.muted}>Le catalogue de récompenses {domain} est épuisé : ce prestige n’apporte aucune récompense (aucune n’est inventée).</p> : (
          <div className={r.choices} role="radiogroup" aria-label="Récompenses proposées">
            {proposals.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={choice === p.id} className={r.choice} onClick={() => setChoice(p.id)}>
                <span className={r.cat}>{REWARD_CATEGORY_LABEL[p.category]} · {RARITY_LABEL[p.rarity]}</span>
                <b>{p.name}</b>
                <span className={r.muted}>{p.description}</span>
              </button>
            ))}
          </div>
        )}
        <p className={r.note} style={{ marginTop: 12 }}>Les propositions viennent de catégories différentes. Une récompense déjà obtenue n’est jamais proposée, et elle sera conservée à tous vos prestiges suivants.</p>
      </Card>
      <Card>
        <label className={r.checkLine}><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} /> Je comprends que le niveau {domain} repart du niveau 1 pour un nouveau cycle, que ma récompense est définitive et que tout mon historique est conservé.</label>
        {error ? <p className={r.err} role="alert">{error}</p> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <Link to="/rpg/prestige" className={`${r.btn} ${r.ghost}`}>Plus tard</Link>
          <button className={r.btn} disabled={busy || !understood || (proposals.length > 0 && !choice)} onClick={() => void confirm()}>Confirmer le prestige {domain} n° {c.nextNumber}</button>
        </div>
      </Card>
      {done ? <Celebration record={done} onClose={() => navigate('/rpg/prestige')} /> : null}
    </div>
  )
}

/** Mise en scène d'un prestige : un événement ponctuel (halo, numéro, titre), sans animation permanente. */
function Celebration({ record, onClose }: { record: PrestigeRecord; onClose: () => void }) {
  const def = record.rewardId ? REWARD_BY_ID[record.rewardId] : null
  // Portail dans <body> : l'animation d'entrée de la page crée un contexte de positionnement qui empêcherait le plein écran.
  return createPortal(
    <div className={r.celebrate} role="dialog" aria-modal="true" aria-label={`Prestige ${record.domain} n° ${record.number} accompli`}>
      <div className={r.celebrateBox}>
        <small>PRESTIGE {record.domain}</small>
        <div className={r.burst}><span className={r.burstNum}>{record.number}</span></div>
        <h2>Un nouveau cycle commence</h2>
        <p>Rang {record.rankBefore} ({RANK_TITLES[record.rankBefore as keyof typeof RANK_TITLES]}) accompli au niveau {record.levelBefore}.{def ? ` Récompense : ${def.name}.` : ''} Tout votre historique est conservé.</p>
        <button className={r.btn} onClick={onClose} autoFocus>Continuer</button>
      </div>
    </div>,
    document.body,
  )
}
