import { useMemo } from 'react'
import { Badge, Card, EmptyState, Notice, SectionTitle } from '@/design/components'
import { useAppState } from '@/app/AppState'
import { activeFundamental, CYCLE_STATUS_LABEL, cycleId, nextReviewHint, orphanRefs, orientationProgress, PRIORITY_LEVEL_LABEL, priorityProgress, quarterLabel, quarterOf } from '@/core/pilotage'
import { pilotageService } from '@/data/pilotageService'
import { Bar, pct, useRun } from './shared'
import s from './pilotage.module.css'

/** Tableau de bord stratégique : tout est dérivé des données (rien de stocké), les liens sont ceux déclarés par l'utilisateur. */
export function Dashboard({ go }: { go: (slug: string) => void }) {
  const { strategy, lifeCtx, prefs, intel, now } = useAppState()
  const pp = prefs.pilotage
  const vision = strategy.visions.find((v) => v.status === 'active') ?? null
  const orientations = strategy.orientations.filter((o) => !o.archived && o.status === 'active')
  const fundamentals = activeFundamental(strategy.priorities)
  const year = now.getFullYear(), q = quarterOf(now)
  const cycle = strategy.cycles.find((c) => c.id === cycleId(year, q)) ?? null
  const attention = intel.observations.filter((o) => o.id.startsWith('strat-') && o.tone === 'attention')
  const positives = intel.observations.filter((o) => o.id.startsWith('strat-') && o.tone === 'positive')
  const orphans = useMemo(() => orphanRefs(strategy, lifeCtx.life).count, [strategy, lifeCtx.life])
  const { error, run } = useRun()
  const empty = !vision && !strategy.orientations.length && !strategy.priorities.length && !strategy.cycles.length

  const linked = useMemo(() => {
    const goalIds = new Set<string>(), projectIds = new Set<string>()
    for (const o of orientations) { o.goalIds.forEach((g) => goalIds.add(g)); o.projectIds.forEach((p) => projectIds.add(p)) }
    for (const p of fundamentals) p.goalIds.forEach((g) => goalIds.add(g))
    const goals = lifeCtx.life.goals.filter((g) => goalIds.has(g.id) && g.status !== 'abandoned')
    const projects = lifeCtx.life.projects.filter((p) => projectIds.has(p.id) && p.status !== 'abandoned')
    return { goals, projects }
  }, [orientations, fundamentals, lifeCtx])

  if (empty) {
    return (
      <Card variant="flat"><EmptyState title="Une trajectoire, à votre rythme">
        <p>Pilotage est facultatif : Level fonctionne très bien sans lui. Si vous le souhaitez, décrivez une vision, des orientations de vie et vos priorités du moment ; Level les relie à vos objectifs et projets existants, sans rien dupliquer.</p>
        <div className={s.actions} style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className={s.mini} onClick={() => go('vision')}>Écrire ma vision</button>
          <button className={s.mini} onClick={() => go('orientations')}>Créer une orientation</button>
        </div>
      </EmptyState></Card>
    )
  }

  const cycleProgress = cycle ? { priorities: cycle.priorityIds.map((id) => strategy.priorities.find((p) => p.id === id)).filter((p) => !!p) } : null
  const coherence = attention.length === 0 ? 'Aucun point d’attention' : `${attention.length} point${attention.length > 1 ? 's' : ''} à regarder`
  return (
    <div className={s.stack}>
      <section className={s.visionCard} aria-label="Vision">
        {vision ? (<>
          <h2>{vision.title}</h2>
          {vision.desiredSituation || vision.description ? <p>{vision.desiredSituation || vision.description}</p> : null}
          <p className={s.visionMeta}>Relue le {new Date(vision.revisedAt).toLocaleDateString('fr-FR')} · <button className={s.mini} onClick={() => go('vision')}>Ouvrir la vision</button></p>
        </>) : (<><h2>Pas encore de vision</h2><p>Facultative : quelques lignes suffisent pour donner un cap à vos orientations.</p><p className={s.visionMeta}><button className={s.mini} onClick={() => go('vision')}>Écrire ma vision</button></p></>)}
      </section>

      {orphans > 0 ? (
        <Card variant="flat">
          <SectionTitle title="Liens vers des éléments supprimés" aside={<Badge tone="neutral">{orphans}</Badge>} />
          <p className={s.note}>{orphans} lien{orphans > 1 ? 's' : ''} de Pilotage pointe{orphans > 1 ? 'nt' : ''} vers un objectif, un projet ou un indicateur qui n’existe plus dans LIFE. Ils sont ignorés à l’affichage et n’affectent aucun calcul. Vous pouvez les retirer : rien d’autre n’est modifié et l’opération est notée dans l’historique.</p>
          {error ? <p className={s.err} role="alert">{error}</p> : null}
          <div className={s.actions} style={{ marginTop: 8 }}><button className={s.mini} onClick={() => void run(() => pilotageService.pruneOrphans())}>Retirer ces liens</button></div>
        </Card>
      ) : null}

      <div className={s.kpis}>
        <div className={s.kpi}><b>{orientations.length}</b><span>orientation{orientations.length > 1 ? 's' : ''} active{orientations.length > 1 ? 's' : ''}</span></div>
        <div className={s.kpi} data-tone={fundamentals.length > pp.maxFundamental ? 'warn' : undefined}><b>{fundamentals.length} / {pp.maxFundamental}</b><span>priorités fondamentales</span></div>
        <div className={s.kpi}><b>{linked.goals.length}</b><span>objectif{linked.goals.length > 1 ? 's' : ''} relié{linked.goals.length > 1 ? 's' : ''}</span></div>
        <div className={s.kpi}><b>{linked.projects.length}</b><span>projet{linked.projects.length > 1 ? 's' : ''} structurant{linked.projects.length > 1 ? 's' : ''}</span></div>
      </div>

      <Card>
        <SectionTitle title="Carte de trajectoire" aside={<span className={s.sub}>de la vision aux actions</span>} />
        <div className={s.map}>
          <div className={s.tier}><span className={s.node}>1</span><div><h3>Vision</h3><div className={s.pills}>{vision ? <span className={s.pill}>{vision.title}</span> : <span className={s.sub}>Non renseignée (facultatif)</span>}</div></div></div>
          <div className={s.tier}><span className={s.node}>2</span><div><h3>Orientations actives <small>{orientations.length}</small></h3>
            <div className={s.pills}>{orientations.length ? orientations.map((o) => { const p = orientationProgress(o, lifeCtx); return <span key={o.id} className={s.pill}>{o.name}{p.value !== null ? <em>{pct(p.value)}</em> : null}</span> }) : <span className={s.sub}>Aucune orientation active</span>}</div></div></div>
          <div className={s.tier}><span className={s.node}>3</span><div><h3>Priorités fondamentales <small>{fundamentals.length} sur {pp.maxFundamental} conseillées</small></h3>
            <div className={s.pills}>{fundamentals.length ? fundamentals.map((p) => { const pr = priorityProgress(p, lifeCtx); return <span key={p.id} className={s.pill} data-tone="fundamental">{p.title}{pr.value !== null ? <em>{pct(pr.value)}</em> : null}</span> }) : <span className={s.sub}>Aucune</span>}</div></div></div>
          <div className={s.tier}><span className={s.node}>4</span><div><h3>Objectifs LIFE reliés <small>{linked.goals.length}</small></h3>
            <div className={s.pills}>{linked.goals.length ? linked.goals.slice(0, 8).map((g) => <span key={g.id} className={s.pill}>{g.title}</span>) : <span className={s.sub}>Aucun : rattachez-en depuis une orientation ou une priorité</span>}</div></div></div>
          <div className={s.tier}><span className={s.node}>5</span><div><h3>Projets structurants <small>{linked.projects.length}</small></h3>
            <div className={s.pills}>{linked.projects.length ? linked.projects.slice(0, 8).map((p) => <span key={p.id} className={s.pill}>{p.title}</span>) : <span className={s.sub}>Aucun</span>}</div></div></div>
        </div>
        <p className={s.note} style={{ marginTop: 10 }}>Les quêtes de LIFE restent la seule source d’XP ; Pilotage ne fait que relier et mesurer.</p>
      </Card>

      <Card>
        <SectionTitle title={`Cycle ${quarterLabel(year, q)}`} aside={cycle ? <Badge tone={cycle.status === 'active' ? 'gold' : 'neutral'}>{CYCLE_STATUS_LABEL[cycle.status]}</Badge> : undefined} />
        {cycle ? (<>
          {cycle.expectedResults.length ? <ul className={s.facts}>{cycle.expectedResults.map((r) => <li key={r}>Résultat attendu : {r}</li>)}</ul> : null}
          <div className={s.list} style={{ marginTop: 10 }}>
            {cycleProgress!.priorities.map((p) => { const pr = priorityProgress(p!, lifeCtx); return <div key={p!.id}><div className={s.itemHead}><b style={{ fontSize: 14 }}>{p!.title}</b><span className={s.sub}>{PRIORITY_LEVEL_LABEL[p!.level]}</span></div><Bar value={pr.value} label={`Avancement de ${p!.title}`} /></div> })}
            {!cycleProgress!.priorities.length ? <p className={s.muted}>Ce cycle ne contient pas encore de priorité.</p> : null}
          </div>
        </>) : <p className={s.muted}>Aucun cycle pour ce trimestre. Un cycle sélectionne vos priorités du moment parmi ce qui existe déjà ; ce n’est pas une liste de tâches. <button className={s.mini} onClick={() => go('cycles')}>Préparer le cycle</button></p>}
      </Card>

      <Card variant={attention.length ? 'event' : 'default'}>
        <SectionTitle title="Cohérence" aside={<span className={s.sub}>{coherence}</span>} />
        <div className={s.list}>
          {[...attention, ...positives].slice(0, 5).map((o) => (
            <div key={o.id} className={s.obs} data-tone={o.tone}><b>{o.title}</b><span>{o.detail}</span>
              <div className={s.badges}><Badge tone="neutral">{o.certainty === 'certain' ? 'Certain' : o.certainty === 'probable' ? 'Probable' : 'Estimation'}</Badge></div></div>
          ))}
          {!attention.length && !positives.length ? <p className={s.muted}>Rien à signaler. Level n’émet une observation que lorsque les données le permettent.</p> : null}
        </div>
        <p className={s.note} style={{ marginTop: 10 }}>Ces constats sont détaillés dans l’analyse de Level (RPG), avec leurs justifications. Changer de priorité fait partie d’une trajectoire : ce n’est pas un défaut.</p>
      </Card>

      <Card>
        <SectionTitle title="Prochaine revue" />
        <p className={s.muted}>{nextReviewHint(now, strategy, pp)}</p>
        <div className={s.actions} style={{ marginTop: 8 }}><button className={s.mini} onClick={() => go('revues')}>Faire une revue</button></div>
      </Card>
      <Notice title="Facultatif et souple">Pilotage ne modifie jamais vos objectifs, projets, échéances ni votre planning. Toute proposition est confirmée par vous, et chaque changement est conservé dans l’historique.</Notice>
    </div>
  )
}
