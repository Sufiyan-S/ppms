import { useState } from 'react'

// Runs `onChange` during render when any value differs from the previous render — React's
// documented replacement for an effect that only resets state.
export function useOnValuesChange(values: readonly unknown[], onChange: () => void) {
  const [previous, setPrevious] = useState(values)
  const changed = values.length !== previous.length || values.some((value, i) => !Object.is(value, previous[i]))
  if (changed) {
    setPrevious(values)
    onChange()
  }
}
