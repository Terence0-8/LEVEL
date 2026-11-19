import { useAppState } from '@/app/AppState'
import { Badge } from '@/design/components'
import type { SafetyLevel } from '@/core/sport/types'
import s from './sport.module.css'

export function SafetyBadge({ level }: { level: SafetyLevel }) {
  return <Badge tone={level === 'NORMAL' ? 'success' : level === 'VIGILANCE' ? 'gold' : 'danger'}>{level === 'NORMAL' ? 'Normal' : level === 'VIGILANCE' ? 'Vigilance' : 'Alerte'}</Badge>
}

/** Bandeau de sécurité : visible dès que la récupération n'est pas normale. La sécurité passe avant les objectifs et les récompenses. */
export function SafetyNotice() {
  const { sport } = useAppState()
  const r = sport.recovery
  if (r.level === 'NORMAL' && r.hasCheckToday) return null
  if (r.level === 'NORMAL') return null
  return (
    <div className={`${s.safety} ${r.level === 'ALERTE' ? s.safetyAlert : s.safetyWarn}`} role="status">
      <b>{r.level === 'ALERTE' ? 'Alerte : repos et prudence' : 'Vigilance'}</b>
      {r.messages.map((m) => <p key={m}>{m}</p>)}
      {r.blocked.length ? <p>Sollicitation bloquée : {r.blocked.map((b) => b.reason).join(' ')} Réévaluez-vous avec le questionnaire pour lever le blocage.</p> : null}
      <small>{r.disclaimer}</small>
    </div>
  )
}
