import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './AppState'
import { Shell } from './Shell'
import { HomePage } from '@/features/home/HomePage'
import { LifePage } from '@/features/life/LifePage'
import { SportPage } from '@/features/sport/SportPage'
import { RpgPage } from '@/features/rpg/RpgPage'
import { PrestigeConfirmPage } from '@/features/rpg/PrestigePanel'
import { HistoryPage } from '@/features/history/HistoryPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { PlanningPage } from '@/features/planning/PlanningPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { BackupPage } from '@/features/backup/BackupPage'
import { SessionPlayer } from '@/features/sport/SessionPlayer'

// HashRouter : fonctionne sur n'importe quel hébergement statique et hors ligne, sans règle de réécriture.
export function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="life" element={<LifePage />} />
            <Route path="life/:section" element={<LifePage />} />
            <Route path="sport" element={<SportPage />} />
            <Route path="sport/seance/:id" element={<SessionPlayer />} />
            <Route path="sport/:section" element={<SportPage />} />
            <Route path="rpg" element={<RpgPage />} />
            <Route path="rpg/prestige/:domain" element={<PrestigeConfirmPage />} />
            <Route path="rpg/:section" element={<RpgPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="bilans" element={<ReportsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="backups" element={<BackupPage />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppStateProvider>
  )
}
