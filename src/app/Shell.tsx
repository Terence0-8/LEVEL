import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '@/design/Icon'
import { LogoWordmark } from '@/design/Logo'
import { useAppState } from './AppState'
import { BackupBanner } from '@/features/backup/BackupBanner'
import s from './Shell.module.css'

export const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Accueil', icon: 'home' },
  { to: '/life', label: 'LIFE', icon: 'life' },
  { to: '/sport', label: 'SPORT', icon: 'sport' },
  { to: '/rpg', label: 'RPG', icon: 'rpg' },
  { to: '/history', label: 'Historique', icon: 'history' },
]

const cls = (base: string, active: boolean) => (active ? `${base} ${s.active}` : base)

/** Annonce spectaculaire quand le niveau global ou le rang change (événement important → or lumineux). */
function useLevelUp() {
  const { progress } = useAppState()
  const prev = useRef<{ demo: boolean; level: number } | null>(null)
  const [msg, setMsg] = useState<{ title: string; sub: string } | null>(null)
  const { level, isDemo, rank } = { level: progress.global.level, isDemo: progress.isDemo, rank: progress.rank }
  useEffect(() => {
    const before = prev.current
    prev.current = { demo: isDemo, level }
    if (before && before.demo === isDemo && level > before.level) {
      setMsg({ title: `Niveau ${level}`, sub: rank.minLevel === level ? `Nouveau rang ${rank.rank} · ${rank.title}` : 'Niveau supérieur atteint' })
      const t = setTimeout(() => setMsg(null), 4200)
      return () => clearTimeout(t)
    }
  }, [level, isDemo, rank])
  return msg
}

export function Shell() {
  const loc = useLocation()
  const toast = useLevelUp()
  const immersive = loc.pathname.startsWith('/sport/seance/')

  return (
    <div className={`${s.shell} ${immersive ? s.immersive : ''}`}>
      <aside className={s.side} aria-label="Navigation principale">
        <div className={s.brand}><LogoWordmark /></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cls(s.link, isActive)}>
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
        <div className={s.spacer} />
        <NavLink to="/backups" className={({ isActive }) => cls(s.link, isActive)}>
          <Icon name="shield" /> Sauvegardes
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => cls(s.link, isActive)}>
          <Icon name="user" /> Profil & réglages
        </NavLink>
      </aside>

      <div>
        <header className={s.top}>
          <LogoWordmark />
          <NavLink to="/profile" className={s.avatarBtn} aria-label="Profil et réglages"><Icon name="user" size={20} /></NavLink>
        </header>
        <main className={s.main}>
          <BackupBanner />
          <div key={loc.pathname} className={s.page}><Outlet /></div>
        </main>
      </div>

      <nav className={s.tabs} aria-label="Navigation principale">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cls(s.tab, isActive)}>
            <Icon name={n.icon} size={22} /> {n.label}
          </NavLink>
        ))}
      </nav>

      {toast ? (
        <div className={s.toast} role="status" aria-live="polite">
          <small>LEVEL UP</small><b>{toast.title}</b><div style={{ fontSize: 12, color: 'var(--c-text)' }}>{toast.sub}</div>
        </div>
      ) : null}
    </div>
  )
}

