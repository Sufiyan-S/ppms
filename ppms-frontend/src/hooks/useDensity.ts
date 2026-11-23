import { useState } from 'react'
import { applyDensity, readStoredDensity, storeDensity } from '../utils/density'
import type { Density } from '../utils/density'

export function useDensity(): [Density, (density: Density) => void] {
  const [density, setDensity] = useState(readStoredDensity)
  const changeDensity = (next: Density) => {
    setDensity(next)
    applyDensity(next)
    storeDensity(next)
  }
  return [density, changeDensity]
}
