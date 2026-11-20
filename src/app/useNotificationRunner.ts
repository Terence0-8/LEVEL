import { useEffect, useRef } from 'react'
import { levelsOf, type NotifContext } from '@/core/notifications'
import type { AppPrefs } from '@/core/prefs'
import type { ProgressSummary } from '@/core/progression'
import type { Commitment } from '@/core/planning'
import type { Quest } from '@/core/quest'
import type { XpEvent } from '@/core/ledger'
import type { RecoveryState } from '@/core/sport/recovery'
import type { RecoveryCheck, SportSession } from '@/core/sport/session'
import type { Recommendation } from '@/core/recommendations'
import type { RpgEvent } from '@/core/rpgEvents'
import { notificationService } from '@/data/notificationService'

interface Args {
  enabled: boolean
  prefs: AppPrefs
  quests: Quest[]
  events: XpEvent[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  recovery: RecoveryState
  commitments: Commitment[]
  progress: ProgressSummary
  rpgEvents: RpgEvent[]
  recommendation: Recommendation | null
}

/**
 * Évalue les rappels toutes les minutes ET quand l'application revient au premier plan (rattrapage à l'ouverture).
 * Utilise toujours l'état le plus récent via une référence : aucun intervalle recréé à chaque changement de données.
 * N'agit jamais en mode démonstration (les données fictives ne déclenchent rien).
 */
export function useNotificationRunner(args: Args) {
  const ref = useRef(args)
  ref.current = args
  useEffect(() => {
    const run = () => {
      const a = ref.current
      if (!a.enabled) return
      const ctx: NotifContext = {
        now: new Date(), prefs: a.prefs.notifications, quests: a.quests, events: a.events, sessions: a.sessions, checks: a.checks,
        recovery: a.recovery, commitments: a.commitments, levels: levelsOf(a.progress), seen: a.prefs.seen, rpgEvents: a.rpgEvents, recommendation: a.recommendation,
      }
      void notificationService.tick(ctx).catch(() => undefined)
    }
    // Après les synchronisations des succès (≈ 1,2 s) et du journal (≈ 1,8 s) : le premier choix tient compte des événements, pas seulement de la recommandation
    const first = setTimeout(run, 5_000)
    const id = setInterval(run, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(first); clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
}
