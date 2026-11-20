import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource-variable/inter'
import '@/design/global.css'
import { registerSW } from 'virtual:pwa-register'
import { App } from '@/app/App'

import { updateSignal } from '@/app/updateSignal'

// Mode « prompt » : une nouvelle version attend que l'utilisateur la valide (voir UpdateBanner)
const updateSW = registerSW({ immediate: true, onNeedRefresh: () => updateSignal.markReady(() => void updateSW(true)) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
