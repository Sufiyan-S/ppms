const MAX_RECENT_CLIENTS = 5

function storageKey(pumpId: number, userId: number) {
  return `ppms_recent_credit_clients:${pumpId}:${userId}`
}

/** Client ids this user picked most recently at this pump, newest first. */
export function readRecentClientIds(pumpId: number, userId: number): number[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(pumpId, userId)) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === 'number') : []
  } catch (error) {
    console.warn('Could not read recent credit clients; showing none.', error)
    return []
  }
}

export function rememberRecentClient(pumpId: number, userId: number, clientId: number): void {
  const recentIds = [clientId, ...readRecentClientIds(pumpId, userId).filter((id) => id !== clientId)]
  try {
    localStorage.setItem(storageKey(pumpId, userId), JSON.stringify(recentIds.slice(0, MAX_RECENT_CLIENTS)))
  } catch (error) {
    console.warn('Could not save the recent credit client; the picker works without it.', error)
  }
}
