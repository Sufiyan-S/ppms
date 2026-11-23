import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n } from './i18n'
import { browserLanguages, detectLanguage, readStoredLanguage } from './i18n/detectLanguage'
import { useAuthStore } from './store/authStore'
import { applyDensity, readStoredDensity } from './utils/density'

applyDensity(readStoredDensity())

const startLanguage = detectLanguage(useAuthStore.getState().user?.preferredLanguage, readStoredLanguage(), browserLanguages())

initI18n(startLanguage)
  .catch((error: unknown) => console.error('Could not load translations; showing English', error))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
