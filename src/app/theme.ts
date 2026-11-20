/** Thème d'affichage : préférence PROPRE À L'APPAREIL (stockée localement, hors sauvegarde : un téléphone peut être clair et un ordinateur sombre). */
export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'level-theme'

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}
const resolve = (p: ThemePref) => (p === 'auto' ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p)

export function applyTheme(p: ThemePref = getThemePref()) {
  const t = resolve(p)
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F5F1E8' : '#15191F')
}
export function setThemePref(p: ThemePref) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p) } catch { /* stockage indisponible : le thème s'applique pour la session */ }
  applyTheme(p)
}
/** Suit le réglage du système tant que la préférence est « automatique » */
export function watchSystemTheme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)')
  mq?.addEventListener?.('change', () => { if (getThemePref() === 'auto') applyTheme('auto') })
}
