import type { CSSProperties, ReactNode } from 'react'
import s from './ui.module.css'
import { Icon } from './Icon'

const cx = (...a: Array<string | false | undefined>) => a.filter(Boolean).join(' ')

export function Card({ variant = 'default', className, style, children, as: Tag = 'section' }: {
  variant?: 'default' | 'raised' | 'event' | 'flat'
  className?: string
  style?: CSSProperties
  children: ReactNode
  as?: 'section' | 'div' | 'article' | 'li'
}) {
  return <Tag className={cx(s.card, variant !== 'default' && s[variant], className)} style={style}>{children}</Tag>
}

export function SectionTitle({ title, aside, level = 2 }: { title: string; aside?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <div className={s.sectionTitle}>
      <H>{title}</H>
      {aside ? <span className={s.aside}>{aside}</span> : null}
    </div>
  )
}

export function ProgressBar({ value, tone = 'gold', thin, label }: { value: number; tone?: 'gold' | 'info' | 'success' | 'event'; thin?: boolean; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cx(s.bar, thin && s.thin)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className={cx(s.fill, tone !== 'gold' && s[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'gold' | 'rpg' | 'success' | 'info' | 'danger'; children: ReactNode }) {
  return <span className={cx(s.badge, tone !== 'neutral' && s[tone])}>{children}</span>
}

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.notice} role="note">
      <Icon name="lock" size={18} />
      <p><strong>{title}</strong> — {children}</p>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}><h3>{title}</h3>{typeof children === 'string' ? <p>{children}</p> : children}</div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className={s.pageHeader} style={right ? { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' } : undefined}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {right}
    </header>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return <div className={s.stat}><span className={cx(s.v, 'num')}>{value}</span><span className={s.l}>{label}</span></div>
}

export function DemoTag() {
  return <Badge tone="info">Démo</Badge>
}
