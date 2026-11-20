import type { Observation, Nature } from './insights'
import type { Recommendation } from './recommendations'
import type { RpgEvent } from './rpgEvents'

/**
 * Narration contextuelle LOCALE : un générateur de textes à gabarits, déterministe (la variante est choisie par le hachage de l'identifiant de
 * l'événement : mêmes entrées, mêmes textes). Chaque phrase s'appuie UNIQUEMENT sur des faits présents dans l'événement ou le bilan ;
 * aucun fait, chiffre ou explication n'est inventé. Ton sobre, mystérieux, élégant ; inspiration atmosphérique, sans reprendre de texte,
 * personnage ou symbole d'une œuvre existante.
 */
export type Tag = Nature | 'recommendation'
export const TAG_LABEL: Record<Tag, string> = { fact: 'Mesuré', estimate: 'Estimation', interpretation: 'Lecture du moteur', recommendation: 'Recommandation' }

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const pick = <T,>(pool: T[], seed: string): T => pool[hash(seed) % pool.length]
const s = (n: number) => (n > 1 ? 's' : '')

type D = Record<string, string | number>
type Gen = (d: D, e: Pick<RpgEvent, 'title' | 'description'>) => { headline: string[]; body: string[] }

const GEN: Record<string, Gen> = {
  'level-up': (d) => ({
    headline: ['Le seuil est franchi.', 'Un nouveau palier s’ouvre.', 'La progression se confirme.'],
    body: [`${d.domain} atteint le niveau ${d.level}.${d.days !== undefined ? ` Il a fallu ${d.days} jour${s(Number(d.days))} depuis le niveau précédent.` : ''}`, `Niveau ${d.level} en ${d.domain}, rang ${d.rank}.${d.days !== undefined ? ` ${d.days} jour${s(Number(d.days))} séparent ce palier du précédent.` : ''}`, `Le niveau ${d.level} de ${d.domain} est atteint.`],
  }),
  'rank-up': (d) => ({
    headline: ['Le rang change.', 'Une nouvelle marque apparaît.', 'Un cap est passé.'],
    body: [`${d.domain} entre dans le rang ${d.rank}, au niveau ${d.level}.`, `Au niveau ${d.level}, ${d.domain} accède au rang ${d.rank}.`, `Rang ${d.rank} : ${d.domain} franchit une nouvelle étape${Number(d.cycle) > 1 ? ` dans le cycle ${d.cycle}` : ''}.`],
  }),
  'global-level': (d) => ({ headline: ['Le niveau global avance.', 'Deux domaines, un même élan.'], body: [`Le niveau global atteint ${d.level}, porté par LIFE et SPORT réunis.`, `Niveau global ${d.level} : l’ensemble de votre progression franchit un palier.`] }),
  'attribute-milestone': (d) => ({ headline: ['Un attribut se renforce.', 'Une qualité s’affirme.'], body: [`${d.attribute} atteint ${d.value} sur 100, nourri par des actions réellement accomplies.`, `${d.attribute} franchit ${d.value} : le fruit d’actions répétées.`] }),
  achievement: (d) => ({ headline: ['Une distinction est gravée.', 'Un succès s’inscrit au registre.', 'Un fait est reconnu.'], body: [`« ${d.achievement} » rejoint vos distinctions (rareté : ${RARITY_FR[String(d.rarity)] ?? d.rarity}).`, `Succès « ${d.achievement} » : la condition est vérifiée dans vos données.`, `Vos données confirment le succès « ${d.achievement} ».`] }),
  reward: (d) => ({ headline: ['Une récompense est acquise.', 'Un choix est scellé.'], body: [`${d.reward} (${String(d.category).toLowerCase()}) est désormais à vous, pour tous les cycles à venir.`, `« ${d.reward} » est conservée définitivement.`] }),
  'prestige-ready': (d) => ({ headline: ['Un nouveau cycle est possible.', 'Le sommet du cycle est atteint.'], body: [`${d.domain} atteint le dernier niveau du rang SSS : le prestige n° ${d.number} est possible, sans obligation.`, `Le prestige n° ${d.number} de ${d.domain} est disponible. Vous pouvez continuer ainsi aussi longtemps que vous le souhaitez.`] }),
  'prestige-done': (d) => ({ headline: ['Le cycle se referme, un autre s’ouvre.', 'Une renaissance, tout l’historique conservé.', 'Le prestige est scellé.'], body: [`Prestige ${d.domain} n° ${d.number} accompli depuis le niveau ${d.level} (rang ${d.rank}).${d.reward ? ` Récompense choisie : ${d.reward}.` : ''}`, `${d.domain} recommence un cycle après le rang ${d.rank}, niveau ${d.level}.${d.reward ? ` « ${d.reward} » est conservée.` : ''}`] }),
  'goal-achieved': (d) => ({ headline: ['Une ambition prend forme.', 'Un objectif est atteint.'], body: [`L’objectif « ${d.goal} » est atteint.`, `« ${d.goal} » rejoint les objectifs atteints.`] }),
  'goal-due-soon': (d) => ({ headline: ['L’échéance approche.', 'Le terme se rapproche.'], body: [`« ${d.goal} » arrive à échéance dans ${d.days} jour${s(Number(d.days))} (${d.due}).`, `Plus que ${d.days} jour${s(Number(d.days))} avant l’échéance de « ${d.goal} ».`] }),
  'project-done': (d) => ({ headline: ['Un projet aboutit.', 'Le chantier est achevé.'], body: [`Le projet « ${d.project} » est terminé${Number(d.steps) ? ` : ${d.steps} étape${s(Number(d.steps))} validée${s(Number(d.steps))}` : ''}.`, `« ${d.project} » est mené à son terme.`] }),
  'project-step-key': (d) => ({ headline: ['Une étape clé est passée.', 'Le projet avance nettement.'], body: [d.done !== undefined ? `Mi-parcours pour « ${d.project} » : ${d.done} étape${s(Number(d.done))} sur ${d.total}.` : `Toutes les étapes de « ${d.project} » sont validées (${d.total}).`, `« ${d.project} » franchit un jalon (${d.done ?? d.total}/${d.total} étapes).`] }),
  'project-resumed': (d) => ({ headline: ['Un projet reprend vie.', 'Le fil est renoué.'], body: [`« ${d.project} » reprend après ${d.days} jours sans activité.`, `Après ${d.days} jours, le projet « ${d.project} » avance de nouveau.`] }),
  'quest-streak': (d) => ({ headline: ['Une habitude s’installe.', 'La constance dessine un rythme.'], body: [`« ${d.quest} » est accomplie ${d.days} jours de suite.`, `${d.days} jours consécutifs pour « ${d.quest} ».`] }),
  'indicator-progress': (d) => ({ headline: ['Un indicateur bouge.', 'La courbe se déplace.'], body: [`${d.indicator} atteint ${d.value} : ${d.pct} % du chemin vers la cible est parcouru.`, `Pour ${d.indicator}, ${d.pct} % du chemin est fait (dernière valeur : ${d.value}).`] }),
  'sport-pr': (d) => ({ headline: ['Une limite recule.', 'Un nouveau repère.'], body: [d.exercise ? `Nouveau record sur « ${d.exercise} » : +${d.gain} % par rapport au précédent.` : `Nouvelle plus longue sortie : ${d.km} km.`, d.exercise ? `« ${d.exercise} » : la performance dépasse de ${d.gain} % le meilleur résultat précédent.` : `${d.km} km : la plus longue sortie à ce jour.`] }),
  'sport-progress': (d) => ({ headline: ['La progression se lit dans les chiffres.', 'Le travail porte ses fruits.'], body: [`Sur « ${d.exercise} », la performance a progressé de plus de ${d.pct} % depuis la première séance.`, `« ${d.exercise} » : plus de ${d.pct} % de progrès mesuré depuis le début.`] }),
  'sport-sessions': (d) => ({ headline: ['Les séances s’accumulent.', 'Le geste devient familier.'], body: [`${d.sessions} séances SPORT sont terminées.`, `La ${d.sessions}ᵉ séance est derrière vous.`] }),
  'sport-endurance': (d) => ({ headline: ['Le souffle s’allonge.', 'L’endurance progresse.'], body: [`Allure de ${d.pace} /km, plus rapide que la moyenne des trois dernières sorties.`, `${d.pace} /km : l’endurance progresse par rapport aux dernières sorties.`] }),
  'sport-regularity': (d) => ({ headline: ['La régularité s’installe.', 'Le rythme tient.'], body: [`${d.weeks} semaines de suite avec ${d.target} séance${s(Number(d.target))} ou plus.`, `L’objectif de ${d.target} séance${s(Number(d.target))} par semaine est tenu ${d.weeks} semaines d’affilée.`] }),
  'sport-return': (d) => ({ headline: ['Le retour est là.', 'On reprend le fil.'], body: [`Séance après ${d.days} jours sans entraînement : reprendre à son rythme est la bonne manière.`, `${d.days} jours se sont écoulés ; la reprise est faite.`] }),
  'recovery-improved': (d) => ({ headline: ['Le corps a repris sa cadence.', 'La récupération est revenue.'], body: [`Après ${d.from === 'ALERTE' ? 'une alerte' : 'une vigilance'}, l’état de récupération est de nouveau normal (${d.day}).`, `Le questionnaire du ${d.day} indique un retour à la normale.`] }),
  'regular-weeks': (d) => ({ headline: ['Un rythme durable se dessine.', 'La constance plutôt que le volume.'], body: [`${d.weeks} semaines de suite avec au moins trois jours d’activité.`, `Trois jours actifs ou plus, ${d.weeks} semaines de suite : un rythme tenable.`] }),
  balance: (d) => ({ headline: ['Deux domaines, un équilibre.', 'LIFE et SPORT avancent ensemble.'], body: [`${d.weeks} semaines de suite avec de l’activité dans LIFE et dans SPORT.`, `L’équilibre entre LIFE et SPORT se maintient depuis ${d.weeks} semaines.`] }),
  resume: (d) => ({ headline: ['La reprise est là.', 'Le fil est repris.'], body: [`L’activité reprend après ${d.days} jours de pause.`, `Après ${d.days} jours calmes, vous voilà de retour.`] }),
  'cap-xp': (d) => ({ headline: ['Un cap personnel est franchi.', 'Un palier d’expérience est atteint.'], body: [`${new Intl.NumberFormat('fr-FR').format(Number(d.xp))} XP cumulées, LIFE et SPORT réunis.`, `Le total atteint ${new Intl.NumberFormat('fr-FR').format(Number(d.xp))} XP.`] }),
}
const RARITY_FR: Record<string, string> = { common: 'commune', rare: 'rare', epic: 'épique', legendary: 'légendaire' }

/** Texte contextualisé d'un événement. Repli sur la description factuelle si le type est inconnu (jamais de texte inventé). */
export function narrateEvent(e: Pick<RpgEvent, 'id' | 'type' | 'data' | 'title' | 'description'>): { headline: string; body: string } {
  const gen = GEN[e.type]
  if (!gen) return { headline: e.title, body: e.description }
  const g = gen(e.data, e)
  return { headline: pick(g.headline, `${e.id}:h`), body: pick(g.body, `${e.id}:b`) }
}

// ── Rapports narratifs ────────────────────────────────────────────────
export interface NarrativeInput {
  kind: 'day' | 'week' | 'month'
  xp: { life: number; sport: number; total: number }
  prevTotal: number | null
  activeDays: number
  periodDays: number
  life: { done: number; planned: number } | null
  sport: { done: number; planned: number; sessions: number; sets: number } | null
  levels: Array<{ domain: 'LIFE' | 'SPORT'; from: number; to: number; rankFrom: string; rankTo: string }>
  attributes: Array<{ label: string; xp: number }>
  events: Array<Pick<RpgEvent, 'title' | 'importance' | 'domain' | 'type'>>
  observations: Observation[]
  recommendations: Recommendation[]
  /** Étapes bloquées, projets en retard… (faits déjà établis par LIFE V1.1) */
  blocked: string[]
}
export interface NarrativeParagraph { tag: Tag; text: string }
export interface NarrativeSection { id: string; title: string; paragraphs: NarrativeParagraph[] }

const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

/** Récit de progression : chaque phrase est tirée des données fournies ; une section sans donnée est omise. */
export function reportNarrative(n: NarrativeInput): NarrativeSection[] {
  const out: NarrativeSection[] = []
  const add = (id: string, title: string, paragraphs: NarrativeParagraph[]) => { if (paragraphs.length) out.push({ id, title, paragraphs }) }
  const dom = (d: 'LIFE' | 'SPORT') => n.levels.find((l) => l.domain === d)

  const state: NarrativeParagraph[] = []
  if (n.xp.total !== 0 || n.activeDays > 0) {
    state.push({ tag: 'fact', text: `${sign(n.xp.total)} XP sur la période (LIFE ${sign(n.xp.life)}, SPORT ${sign(n.xp.sport)}), ${n.activeDays} jour${s(n.activeDays)} d’activité sur ${n.periodDays}.` })
    if (n.prevTotal !== null && n.prevTotal > 0) state.push({ tag: 'estimate', text: n.xp.total >= n.prevTotal ? `Rythme au moins égal à la période précédente (${sign(n.prevTotal)} XP).` : `Rythme plus calme que la période précédente (${sign(n.prevTotal)} XP) : un rythme variable est normal.` })
  } else if (n.kind !== 'day') state.push({ tag: 'fact', text: 'Aucune activité enregistrée sur la période : une pause fait partie du rythme.' })
  for (const o of n.observations.filter((x) => x.domain === 'RPG' && x.tone !== 'attention').slice(0, 2)) state.push({ tag: o.nature, text: `${o.title}. ${o.detail}` })
  add('state', 'État général', state)

  const life: NarrativeParagraph[] = []
  const lv = dom('LIFE')
  if (lv && lv.to > lv.from) life.push({ tag: 'fact', text: `LIFE passe du niveau ${lv.from} au niveau ${lv.to}${lv.rankTo !== lv.rankFrom ? ` et du rang ${lv.rankFrom} au rang ${lv.rankTo}` : ''}.` })
  if (n.life && n.life.planned > 0) life.push({ tag: 'estimate', text: `${n.life.done} élément${s(n.life.done)} réalisé${s(n.life.done)} sur ${n.life.planned} prévu${s(n.life.planned)} (exécution du planning, pas un jugement).` })
  for (const o of n.observations.filter((x) => x.domain === 'LIFE' && x.tone !== 'attention').slice(0, 2)) life.push({ tag: o.nature, text: `${o.title}. ${o.detail}` })
  add('life', 'Progression LIFE', life)

  const sport: NarrativeParagraph[] = []
  const sv = dom('SPORT')
  if (sv && sv.to > sv.from) sport.push({ tag: 'fact', text: `SPORT passe du niveau ${sv.from} au niveau ${sv.to}${sv.rankTo !== sv.rankFrom ? ` et du rang ${sv.rankFrom} au rang ${sv.rankTo}` : ''}.` })
  if (n.sport && (n.sport.sessions > 0 || n.sport.planned > 0)) sport.push({ tag: 'fact', text: `${n.sport.sessions} séance${s(n.sport.sessions)} terminée${s(n.sport.sessions)}${n.sport.sets ? `, ${n.sport.sets} série${s(n.sport.sets)}` : ''}${n.sport.planned ? ` (${n.sport.done} sur ${n.sport.planned} prévue${s(n.sport.planned)})` : ''}.` })
  for (const o of n.observations.filter((x) => x.domain === 'SPORT' && x.tone !== 'attention').slice(0, 2)) sport.push({ tag: o.nature, text: `${o.title}. ${o.detail}` })
  add('sport', 'Progression SPORT', sport)

  add('attributes', 'Évolution des attributs', n.attributes.filter((a) => a.xp > 0).slice(0, 3).map((a) => ({ tag: 'fact' as const, text: `${a.label} : ${sign(a.xp)} XP.` })))

  const marks = n.events.filter((e) => e.importance !== 'info').slice(0, 5)
  add('highlights', 'Accomplissements marquants', marks.map((e) => ({ tag: 'fact' as const, text: e.title })))

  const diffs: NarrativeParagraph[] = n.blocked.map((b) => ({ tag: 'fact' as const, text: b }))
  for (const o of n.observations.filter((x) => x.tone === 'attention').slice(0, 3)) diffs.push({ tag: o.nature, text: `${o.title}. ${o.detail}` })
  add('difficulties', 'Difficultés ou blocages observés', diffs)

  const recs = n.recommendations.slice(0, 3)
  add('recommendations', 'Recommandations', recs.map((r) => ({ tag: 'recommendation' as const, text: `${r.title} — ${r.recommendation}` })))
  add('next', 'Prochaines étapes possibles', recs.filter((r) => r.action).slice(0, 2).map((r) => ({ tag: 'recommendation' as const, text: `${(r.action as { label?: string }).label ?? 'Voir'} : ${r.title.toLowerCase()}.` })))
  return out
}
