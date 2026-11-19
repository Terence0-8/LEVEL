import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './AppState'
import { Shell } from './Shell'
import { HomePage } from '@/features/home/HomePage'
import { LifePage } from '@/features/life/LifePage'
import { SportPage } from '@/features/sport/SportPage'
import { RpgPage } from '@/features/rpg/RpgPage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'

// HashRouter : fonctionne sur n'importe quel hébergement statique et hors ligne, sans règle de réécriture.
export function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="life" element={<LifePage />} />
            <Route path="sport" element={<SportPage />} />
            <Route path="rpg" element={<RpgPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppStateProvider>
  )
}
