import { useEffect, useRef, useState } from 'react'
import s from './tabs.module.css'

export interface TabItem { id: string; label: string; badge?: number | string; badgeLabel?: string; dot?: 'warn' | 'alert' }

/**
 * Navigation secondaire d'un espace : quelques onglets essentiels, le reste derrière « Plus » (divulgation progressive).
 * Rien n'est retiré : les sections avancées restent à un geste, et la section courante est toujours signalée.
 */
export function Tabs({ items, primary, value, onChange, label, color }: { items: TabItem[]; primary: string[]; value: string; onChange: (id: string) => void; label: string; color?: string }) {
  const main = primary.map((id) => items.find((x) => x.id === id)!).filter(Boolean)
  const more = items.filter((x) => !primary.includes(x.id))
  const inMore = more.find((x) => x.id === value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const pick = (id: string) => { setOpen(false); onChange(id) }
  return (
    <div className={s.wrap} ref={ref} style={color ? { ['--tab-color' as string]: color } : undefined}>
      <div className={s.row} role="tablist" aria-label={label}>
        {main.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} className={s.tab} onClick={() => pick(t.id)}>
            {t.label}{t.badge ? <span className={s.badge} aria-label={t.badgeLabel}>{t.badge}</span> : null}{t.dot ? <i className={`${s.dot} ${t.dot === 'alert' ? s.alert : ''}`} aria-hidden="true" /> : null}
          </button>
        ))}
        {more.length ? (
          <button role="tab" aria-selected={!!inMore} aria-haspopup="true" aria-expanded={open} className={s.tab} onClick={() => setOpen(!open)}>
            {inMore ? inMore.label : 'Plus'}{inMore?.badge ? <span className={s.badge} aria-label={inMore.badgeLabel}>{inMore.badge}</span> : null}{!inMore && more.some((m) => m.badge || m.dot) ? <i className={s.dot} aria-label="Des éléments demandent votre attention dans ce menu" /> : null}<span aria-hidden="true" className={s.caret}>▾</span>
          </button>
        ) : null}
      </div>
      {open ? (
        <div className={s.menu} role="group" aria-label={`Autres sections : ${label}`}>
          {more.map((t) => (
            <button key={t.id} className={s.item} aria-current={value === t.id ? 'page' : undefined} onClick={() => pick(t.id)}>
              {t.label}{t.badge ? <span className={s.badge} aria-label={t.badgeLabel}>{t.badge}</span> : null}{t.dot ? <i className={`${s.dot} ${t.dot === 'alert' ? s.alert : ''}`} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
