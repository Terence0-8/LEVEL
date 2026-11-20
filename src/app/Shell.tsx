import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon, type IconName } from '@/design/Icon'
import { LogoWordmark } from '@/design/Logo'
import { useAppState } from './AppState'
import { REWARD_BY_ID } from '@/core/prestigeRewards'
import { narrateEvent } from '@/core/narration'
import type { RpgEvent } from '@/core/rpgEvents'
import { BackupBanner } from '@/features/backup/BackupBanner'
import { UpdateBanner } from './UpdateBanner'
import s from './Shell.module.css'

/** Cinq espaces essentiels. Planning, bilans et historique restent accessibles depuis l'accueil et l'espace Progression ; réglages et sauvegardes depuis le profil. */
export const NAV: Array<{ to: string; label: string; icon: IconName; color: string }> = [
  { to: '/', label: 'Accueil', icon: 'home', color: 'var(--c-accent)' },
  { to: '/life', label: 'LIFE', icon: 'life', color: 'var(--c-life)' },
  { to: '/sport', label: 'SPORT', icon: 'sport', color: 'var(--c-sport)' },
  { to: '/rpg', label: 'Progression', icon: 'rpg', color: 'var(--c-rpg)' },
  { to: '/pilotage', label: 'Pilotage', icon: 'compass', color: 'var(--c-pilot)' },
]
/** Entrées secondaires du menu latéral (grand écran) */
const MORE: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/planning', label: 'Planning', icon: 'calendar' },
  { to: '/bilans', label: 'Bilans', icon: 'report' },
  { to: '/history', label: 'Historique', icon: 'history' },
]

const cls = (base: string, active: boolean) => (active ? `${base} ${s.active}` : base)

/** Annonce quand un niveau (global ou de domaine) ou un rang change : événement important → or lumineux. */
function useLevelUp() {
  const { progress, prefs } = useAppState()
  const prev = useRef<{ demo: boolean; global: number; life: number; sport: number; rankLife: string; rankSport: string; cycles: string } | null>(null)
  const [msg, setMsg] = useState<{ title: string; sub: string; rank: boolean } | null>(null)
  const celebrate = prefs.rpg.celebrations
  const now = {
    demo: progress.isDemo, global: progress.global.level, life: progress.life.level, sport: progress.sportLevel.level,
    rankLife: progress.lifeRank?.rank ?? '', rankSport: progress.sportRank?.rank ?? '',
    cycles: `${progress.cycles?.LIFE.cycle ?? 1}/${progress.cycles?.SPORT.cycle ?? 1}`,
  }
  const key = JSON.stringify(now)
  useEffect(() => {
    const before = prev.current
    prev.current = now
    // Un prestige remet le niveau du domaine à 1 : aucun bandeau de montée de niveau dans ce cas (l'écran de prestige s'en charge).
    if (!celebrate || !before || before.demo !== now.demo || before.cycles !== now.cycles) return
    let next: { title: string; sub: string; rank: boolean } | null = null
    if (now.rankLife !== before.rankLife && now.life > before.life) next = { title: `LIFE · rang ${now.rankLife}`, sub: `Nouveau rang LIFE (niveau ${now.life})`, rank: true }
    else if (now.rankSport !== before.rankSport && now.sport > before.sport) next = { title: `SPORT · rang ${now.rankSport}`, sub: `Nouveau rang SPORT (niveau ${now.sport})`, rank: true }
    else if (now.global > before.global) next = { title: `Niveau ${now.global}`, sub: progress.rank.minLevel === now.global ? `Nouveau rang ${progress.rank.rank} · ${progress.rank.title}` : 'Niveau supérieur atteint', rank: progress.rank.minLevel === now.global }
    else if (now.life > before.life) next = { title: `LIFE · niveau ${now.life}`, sub: 'Niveau LIFE supérieur', rank: false }
    else if (now.sport > before.sport) next = { title: `SPORT · niveau ${now.sport}`, sub: 'Niveau SPORT supérieur', rank: false }
    if (next) {
      setMsg(next)
      const t = setTimeout(() => setMsg(null), next.rank ? 5200 : 4200)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, celebrate])
  return msg
}

/** Événements majeurs ou exceptionnels apparus pendant la session : présentation plus marquée (niveaux et rangs ont déjà leur bandeau). */
function useMajorEvent() {
  const { intel, demo } = useAppState()
  const known = useRef<Set<string> | null>(null)
  const [ev, setEv] = useState<RpgEvent | null>(null)
  useEffect(() => {
    if (demo) return
    const ids = new Set(intel.unseen.map((e) => e.id))
    if (known.current === null) { known.current = ids; return }
    const fresh = intel.unseen.find((e) => !known.current!.has(e.id) && (e.importance === 'major' || e.importance === 'exceptional') && e.type !== 'level-up' && e.type !== 'rank-up')
    known.current = ids
    if (fresh) { setEv(fresh); const t = setTimeout(() => setEv(null), 7000); return () => clearTimeout(t) }
  }, [intel.unseen, demo])
  return [ev] as const
}

export function Shell() {
  const loc = useLocation()
  const toast = useLevelUp()
  const [majorEv] = useMajorEvent()
  const { prefs } = useAppState()
  const fxDef = prefs.rpg.effect ? REWARD_BY_ID[prefs.rpg.effect] : undefined
  const fx = fxDef?.effect.type === 'levelup-effect' ? s[fxDef.effect.css] : ''
  const immersive = loc.pathname.startsWith('/sport/seance/')

  return (
    <div className={`${s.shell} ${immersive ? s.immersive : ''}`}>
      <aside className={s.side} aria-label="Navigation principale">
        <div className={s.brand}><LogoWordmark /></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cls(s.link, isActive)} style={{ ['--nav-color' as string]: n.color }}>
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
        <div className={s.group}>Plus</div>
        {MORE.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cls(s.link, isActive)}>
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
          <UpdateBanner />
          <BackupBanner />
          <div key={loc.pathname} className={s.page}><Outlet /></div>
        </main>
      </div>

      <nav className={s.tabs} aria-label="Navigation principale">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cls(s.tab, isActive)} style={{ ['--nav-color' as string]: n.color }}>
            <Icon name={n.icon} size={22} /> {n.label}
          </NavLink>
        ))}
      </nav>

      {majorEv ? (
        <div popover="manual" ref={(el: HTMLDivElement | null) => { if (el && !el.matches(':popover-open')) { try { el.showPopover() } catch { /* navigateur sans Popover API : repli sur la position fixe */ } } }} className={`${s.eventToast} ${majorEv.importance === 'exceptional' ? s.eventExceptional : ''}`} role="status" aria-live="polite">
          <small>{majorEv.importance === 'exceptional' ? 'MOMENT EXCEPTIONNEL' : 'MOMENT MARQUANT'}</small>
          <b>{majorEv.title}</b>
          <span>{narrateEvent(majorEv).body}</span>
        </div>
      ) : null}
      {toast ? (
        <div className={`${s.toast} ${fx ?? ''} ${toast.rank ? s.toastRank : ''}`} role="status" aria-live="polite">
          <small>{toast.rank ? 'NOUVEAU RANG' : 'LEVEL UP'}</small><b>{toast.title}</b><div style={{ fontSize: 12, color: 'var(--c-text)' }}>{toast.sub}</div>
        </div>
      ) : null}
    </div>
  )
}

