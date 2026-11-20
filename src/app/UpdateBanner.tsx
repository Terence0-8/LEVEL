import { useEffect, useState } from 'react'
import { updateSignal } from './updateSignal'
import s from './Shell.module.css'

/** Mise à jour de l'application disponible : jamais imposée (une saisie en cours ne doit pas être perdue). Les données locales sont conservées. */
export function UpdateBanner() {
  const [ready, setReady] = useState(updateSignal.isReady())
  useEffect(() => updateSignal.subscribe(setReady), [])
  if (!ready) return null
  return (
    <div className={s.update} role="status">
      <div><b>Une nouvelle version de Level est prête.</b><span>Vos données restent sur cet appareil. Terminez ce que vous saisissez, puis mettez à jour quand vous le souhaitez.</span></div>
      <div className={s.updateActions}>
        <button type="button" onClick={() => updateSignal.apply()}>Mettre à jour</button>
        <button type="button" onClick={() => updateSignal.dismiss()}>Plus tard</button>
      </div>
    </div>
  )
}
