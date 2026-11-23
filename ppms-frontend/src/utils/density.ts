export type Density = 'comfortable' | 'compact'

export const DENSITY_STORAGE_KEY = 'ppms_density'

export function readStoredDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    // Storage blocked (private mode): every visit starts comfortable.
    return 'comfortable'
  }
}

export function storeDensity(density: Density): void {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, density)
  } catch (error) {
    console.warn('Could not remember the chosen density on this device', error)
  }
}

/** index.css reads data-density; phones keep comfortable touch sizes whatever is set. */
export function applyDensity(density: Density): void {
  document.documentElement.dataset.density = density
}
