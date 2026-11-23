const ENTRANCE_PLAYED_KEY = 'ppms_topbar_entrance_played'

/** True once the top bar's entrance has played in this browser tab, so route changes and reloads skip it. */
export function readTopBarEntrancePlayed(): boolean {
  try {
    return sessionStorage.getItem(ENTRANCE_PLAYED_KEY) === 'true'
  } catch {
    // Storage blocked (private mode): skip the entrance rather than replay it on every visit.
    return true
  }
}

export function storeTopBarEntrancePlayed(): void {
  try {
    sessionStorage.setItem(ENTRANCE_PLAYED_KEY, 'true')
  } catch (error) {
    console.warn('Could not remember that the top bar entrance played', error)
  }
}
