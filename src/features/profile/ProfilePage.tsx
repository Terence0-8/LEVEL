import { useEffect, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Card, PageHeader, SectionTitle } from '@/design/components'
import { repos } from '@/data/repositories'
import s from '../pages.module.css'

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.toggle}>
      <div><div>{label}</div><small>{hint}</small></div>
      <button role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)} />
    </div>
  )
}

export function ProfilePage() {
  const { displayName, settings } = useAppState()
  const [name, setName] = useState(displayName)
  const [saved, setSaved] = useState(false)
  useEffect(() => setName(displayName), [displayName])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    await repos.profile.setName(name)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className={s.stack}>
      <PageHeader title="Profil & réglages" subtitle="Vos données restent sur cet appareil." />
      <Card>
        <SectionTitle title="Profil" />
        <form onSubmit={save} className={s.field}>
          <label htmlFor="name">Nom affiché</label>
          <div className={s.inline}>
            <input id="name" className={s.input} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            <button className={s.btn} type="submit">{saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
          </div>
        </form>
      </Card>
      <Card>
        <SectionTitle title="Préférences" />
        <Toggle label="Données de démonstration" hint="Affiche des données fictives (niveaux, quêtes, séances) pour illustrer l'application." checked={settings.showDemoData} onChange={(v) => void repos.settings.set('showDemoData', v)} />
        <Toggle label="Réduire les animations" hint="Désactive les transitions et effets lumineux animés." checked={settings.reducedMotion} onChange={(v) => void repos.settings.set('reducedMotion', v)} />
      </Card>
      <Card>
        <SectionTitle title="Démonstration" />
        <p style={{ color: 'var(--c-text-dim)', fontSize: 13, marginBottom: 12 }}>Remet à zéro les quêtes fictives cochées. Ne touche ni à votre profil ni à vos réglages.</p>
        <button className={`${s.btn} ${s.ghost}`} onClick={() => void repos.demo.reset()}>Réinitialiser les quêtes de démo</button>
      </Card>
    </div>
  )
}
