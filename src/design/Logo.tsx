/** Monogramme : tuile verte douce, « L » en ivoire dont la barre se prolonge en chevron d'ascension. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Level">
      <rect x="24" y="24" width="464" height="464" rx="120" fill="#78B7A2" />
      <path d="M170 110h64v216h118v62H170z" fill="#15191F" />
      <path d="M286 238l66-66 66 66-34 0-32-32-32 32z" fill="#15191F" opacity=".9" />
    </svg>
  )
}

export function LogoWordmark() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={32} />
      <span style={{ fontFamily: 'var(--font-title)', fontWeight: 750, fontSize: 21, letterSpacing: '-0.02em', color: 'var(--c-text)' }}>level</span>
    </span>
  )
}
