import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { changeAppLanguage } from './index'
import { browserLanguages, detectLanguage, readStoredLanguage } from './detectLanguage'

/** Signing in switches to the user's language; signing out goes back to this device's choice. */
export function useLanguageFollowsUser(): void {
  const userLanguage = useAuthStore((state) => state.user?.preferredLanguage)
  useEffect(() => {
    changeAppLanguage(detectLanguage(userLanguage, readStoredLanguage(), browserLanguages())).catch((error: unknown) => {
      console.error('Could not switch the screen language', error)
    })
  }, [userLanguage])
}
