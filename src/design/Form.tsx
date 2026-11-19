import type { ReactNode } from 'react'
import s from './form.module.css'

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label htmlFor={htmlFor} className={s.label}>{label}</label>
      {children}
      {hint ? <p className={s.hint}>{hint}</p> : null}
    </div>
  )
}

/** Choix exclusif sous forme de boutons segmentés (tactile, accessible). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string
}) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={s.segBtn} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export const inputClass = s.input
export const textareaClass = `${s.input} ${s.textarea}`
export const smallBtn = s.small
export const errorClass = s.error
