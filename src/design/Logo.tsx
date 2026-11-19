import { useId } from 'react'

/** Monogramme géométrique « L » : fût vertical + base, surmonté d'un chevron d'ascension. */
export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Level">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#C9B17A" />
          <stop offset="1" stopColor="#F5D889" />
        </linearGradient>
      </defs>
      <rect x="20" y="20" width="472" height="472" rx="108" fill="#12141A" stroke="#C9B17A" strokeOpacity=".35" strokeWidth="10" />
      <path d="M168 96h56v224h120v56H168z" fill={`url(#${id})`} />
      <path d="M272 232l72-72 72 72h-32l-40-40-40 40z" fill={`url(#${id})`} opacity=".92" />
    </svg>
  )
}

export function LogoWordmark() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={34} />
      <span style={{ fontFamily: 'var(--font-title)', fontWeight: 700, letterSpacing: '0.28em', fontSize: 18, color: 'var(--c-gold)' }}>LEVEL</span>
    </span>
  )
}
