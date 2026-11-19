import type { ReactNode } from 'react'
import { useAppState } from '@/app/AppState'
import { EmptyState } from '@/design/components'
import type { DemoView } from '@/mocks/demoView'
import { Link } from 'react-router-dom'

/** Rend les enfants avec les données de démo, ou un état vide si elles sont masquées. */
export function DemoGate({ children }: { children: (demo: DemoView) => ReactNode }) {
  const { demo } = useAppState()
  if (!demo) {
    return (
      <EmptyState title="Aucune donnée pour l'instant">
        Les données de démonstration sont masquées et ce module n'enregistre pas encore de données réelles.{' '}
        <Link to="/profile" style={{ color: 'var(--c-gold)' }}>Réafficher la démo</Link>
      </EmptyState>
    )
  }
  return <>{children(demo)}</>
}
