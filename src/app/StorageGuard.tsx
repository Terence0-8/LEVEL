import { useEffect, useState, type ReactNode } from 'react'
import { db } from '@/data/db'

/**
 * Vérifie que le stockage local (IndexedDB) est disponible avant de démarrer. Sinon (navigation privée restrictive, stockage désactivé ou
 * corrompu, quota saturé à l'ouverture), l'application l'explique au lieu d'afficher un écran vide : rien n'est perdu, rien n'est écrit.
 */
export function StorageGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | { error: string }>('checking')
  useEffect(() => {
    let live = true
    Promise.resolve().then(() => db.open()).then(() => live && setState('ok'), (e: unknown) => live && setState({ error: e instanceof Error ? `${e.name}${e.message ? ` — ${e.message}` : ''}` : 'erreur inconnue' }))
    return () => { live = false }
  }, [])
  if (state === 'checking') return <div style={{ minHeight: '100vh' }} aria-busy="true" />
  if (state === 'ok') return <>{children}</>
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 20px', color: 'var(--c-text)', lineHeight: 1.6 }} role="alert">
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: 22, color: 'var(--c-accent)' }}>Le stockage local est indisponible</h1>
      <p>Level conserve toutes vos données sur cet appareil, dans le stockage du navigateur (IndexedDB). Il n’a pas pu l’ouvrir, donc rien n’a été lu ni modifié.</p>
      <p>Causes fréquentes : navigation privée, stockage désactivé dans les réglages du navigateur, espace disque saturé ou profil du navigateur endommagé. Essayez une fenêtre normale, libérez de l’espace, puis rechargez la page.</p>
      <p style={{ color: 'var(--c-text-dim)', fontSize: 13 }}>Détail technique : {state.error}</p>
      <p style={{ color: 'var(--c-text-dim)', fontSize: 13 }}>Vos données existantes, si elles sont intactes, réapparaîtront dès que le stockage sera accessible. Si vous disposez d’un fichier de sauvegarde exporté, vous pourrez le restaurer ensuite depuis Profil → Sauvegardes.</p>
      <button type="button" onClick={() => location.reload()} style={{ minHeight: 44, padding: '8px 18px', borderRadius: 99, border: '1px solid var(--c-line-strong)', background: 'var(--c-card)', color: 'var(--c-text)' }}>Réessayer</button>
    </main>
  )
}
