import { useState, type ReactNode } from 'react'
import { PilotageError } from '@/data/pilotageService'
import type { Horizon } from '@/core/pilotage'
import { HORIZON_LABEL } from '@/core/pilotage'
import s from './pilotage.module.css'

export const errMsg = (e: unknown) => (e instanceof PilotageError ? e.message : 'Action impossible pour le moment.')
export const pct = (v: number) => `${Math.round(v * 100)} %`
export const HORIZONS: Horizon[] = ['short', 'mid', 'long']
export const horizonOptions = HORIZONS.map((v) => ({ value: v, label: HORIZON_LABEL[v] }))

/** Exécute une commande et mémorise un éventuel message d'erreur. L'erreur peut porter un code (`over_limit`) pour une confirmation explicite. */
export function useRun() {
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null); setCode(null)
    try { return await fn() } catch (e) { setError(errMsg(e)); setCode(e instanceof PilotageError ? e.code : null); return undefined }
  }
  return { error, code, setError, run }
}

/** Liste de cases à cocher pour rattacher des éléments LIFE existants (aucune création : on référence). */
export function LinkPicker({ legend, options, value, onChange, empty }: { legend: string; options: Array<{ id: string; label: string; hint?: string }>; value: string[]; onChange: (v: string[]) => void; empty: ReactNode }) {
  if (!options.length) return <p className={s.note}>{empty}</p>
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={s.sub} style={{ marginBottom: 6 }}>{legend}</legend>
      <div className={s.optList}>
        {options.map((o) => (
          <label key={o.id}><input type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])} /><span>{o.label}{o.hint ? <small className={s.sub}> · {o.hint}</small> : null}</span></label>
        ))}
      </div>
    </fieldset>
  )
}

export function Bar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <p className={s.sub}>Aucun objectif ni projet rattaché : pas d’avancement à calculer.</p>
  return <div className={s.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: `${Math.round(value * 100)}%` }} /></div>
}

export const frDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
