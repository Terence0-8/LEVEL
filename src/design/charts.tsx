import type { ReactNode } from 'react'
import s from './ui.module.css'
import type { Attribute } from '@/core/types'

export function Ring({ progress, size = 120, stroke = 8, children, label, tone = 'gold' }: {
  progress: number; size?: number; stroke?: number; children?: ReactNode; label: string; tone?: 'gold' | 'info' | 'success'
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = tone === 'gold' ? 'var(--c-gold)' : tone === 'info' ? 'var(--c-info)' : 'var(--c-success)'
  return (
    <div className={s.ring} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface)" strokeWidth={stroke} />
        <circle className={s.ringArc} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))} />
      </svg>
      <div className={s.ringLabel}>{children}</div>
    </div>
  )
}

/** Radar hexagonal des attributs (SVG pur, sans dépendance). */
export function RadarChart({ attributes, size = 260 }: { attributes: Attribute[]; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 38
  const n = attributes.length
  const pt = (i: number, k: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k] as const
  }
  const ring = (k: number) => attributes.map((_, i) => pt(i, k).join(',')).join(' ')
  const shape = attributes.map((a, i) => pt(i, a.value / 100).join(',')).join(' ')
  return (
    <svg className={s.chart} width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size }} role="img"
      aria-label={'Attributs : ' + attributes.map((a) => `${a.label} ${a.value}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={ring(k)} fill="none" stroke="var(--c-line)" strokeWidth={1} />)}
      {attributes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--c-line)" /> })}
      <polygon points={shape} fill="rgba(201,177,122,0.18)" stroke="var(--c-gold)" strokeWidth={1.8} strokeLinejoin="round" />
      {attributes.map((a, i) => { const [x, y] = pt(i, a.value / 100); return <circle key={a.id} cx={x} cy={y} r={3.2} fill="var(--c-gold-bright)" /> })}
      {attributes.map((a, i) => {
        const [x, y] = pt(i, 1.2)
        return <text key={a.id} x={x} y={y} fontSize={11} textAnchor="middle" dominantBaseline="middle">{a.label}</text>
      })}
    </svg>
  )
}

export function BarChart({ data, height = 120, label }: { data: Array<{ label: string; value: number }>; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / data.length
  return (
    <svg className={s.chart} width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 18)
        return <rect key={i} x={i * w + w * 0.18} y={height - 14 - h} width={w * 0.64} height={Math.max(h, d.value ? 2 : 0)} rx={1.2}
          fill={d.value ? 'var(--c-gold)' : 'var(--c-surface)'} opacity={d.value ? 0.9 : 0.5} />
      })}
    </svg>
  )
}
