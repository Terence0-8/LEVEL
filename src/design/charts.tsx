import type { ReactNode } from 'react'
import s from './ui.module.css'
import type { Attribute } from '@/core/types'

export function Ring({ progress, size = 120, stroke = 8, children, label, tone = 'gold' }: {
  progress: number; size?: number; stroke?: number; children?: ReactNode; label: string; tone?: 'gold' | 'info' | 'success'
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = tone === 'gold' ? 'var(--c-rpg)' : tone === 'info' ? 'var(--c-info)' : 'var(--c-success)'
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
      <polygon points={shape} fill="color-mix(in srgb, var(--c-rpg) 18%, transparent)" stroke="var(--c-rpg)" strokeWidth={1.8} strokeLinejoin="round" />
      {attributes.map((a, i) => { const [x, y] = pt(i, a.value / 100); return <circle key={a.id} cx={x} cy={y} r={3.2} fill="var(--c-rpg-strong)" /> })}
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
          fill={d.value ? 'var(--c-rpg)' : 'var(--c-surface)'} opacity={d.value ? 0.9 : 0.5} />
      })}
    </svg>
  )
}

/** Courbe d'évolution (indicateurs) : points dans l'ordre chronologique, ligne de cible facultative, repères min/max et dates extrêmes. */
export function LineChart({ points, target, height = 140, label, format }: {
  points: Array<{ label: string; value: number }>; target?: number | null; height?: number; label: string; format?: (v: number) => string
}) {
  const W = 320, padL = 8, padR = 8, padT = 14, padB = 22
  const vals = points.map((p) => p.value).concat(target != null ? [target] : [])
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1)
  const x = (i: number) => (points.length === 1 ? W / 2 : padL + (i / (points.length - 1)) * (W - padL - padR))
  const y = (v: number) => padT + (1 - (v - lo) / span) * (height - padT - padB)
  const f = format ?? ((v: number) => String(Math.round(v * 100) / 100))
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  return (
    <svg className={s.chart} width="100%" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} style={{ overflow: 'visible' }}>
      {target != null ? (
        <g>
          <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke="var(--c-success)" strokeDasharray="4 4" strokeWidth={1} opacity={0.8} />
          <text x={W - padR} y={y(target) - 4} fontSize={9} textAnchor="end" fill="var(--c-success)">cible {f(target)}</text>
        </g>
      ) : null}
      {points.length > 1 ? <path d={path} fill="none" stroke="var(--c-rpg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 2.8} fill={i === points.length - 1 ? 'var(--c-rpg-strong)' : 'var(--c-rpg)'} />)}
      <text x={x(points.length - 1)} y={y(points[points.length - 1].value) - 8} fontSize={10} textAnchor={points.length > 1 ? 'end' : 'middle'} fill="var(--c-text)">{f(points[points.length - 1].value)}</text>
      <text x={padL} y={height - 6} fontSize={9} fill="var(--c-text-faint)">{points[0].label}</text>
      {points.length > 1 ? <text x={W - padR} y={height - 6} fontSize={9} textAnchor="end" fill="var(--c-text-faint)">{points[points.length - 1].label}</text> : null}
    </svg>
  )
}

/** Mini courbe sans axes (cartes de liste). */
export function Sparkline({ values, width = 84, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)} ${((1 - (v - lo) / span) * (height - 6) + 3).toFixed(1)}`).join(' ')
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} fill="none" stroke="var(--c-rpg)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
}
