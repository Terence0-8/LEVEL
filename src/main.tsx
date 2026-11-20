import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/figtree'
import '@/design/global.css'
import { registerSW } from 'virtual:pwa-register'
import { App } from '@/app/App'
import { watchSystemTheme } from '@/app/theme'

import { updateSignal } from '@/app/updateSignal'

// Mode « prompt » : une nouvelle version attend que l'utilisateur la valide (voir UpdateBanner)
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => updateSignal.markReady(() => void updateSW(true)) })

watchSystemTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
