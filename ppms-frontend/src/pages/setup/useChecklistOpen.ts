import { useState } from 'react'

/**
 * Whether the setup step list is shown: hidden once every required step is done, shown while any is not.
 * A required step that becomes undone again shows the list without the owner asking.
 */
export function useChecklistOpen(complete: boolean): [boolean, (open: boolean) => void] {
  const [state, setState] = useState({ complete, open: !complete })
  if (state.complete !== complete) setState({ complete, open: !complete })
  const open = state.complete === complete ? state.open : !complete
  return [open, (nextOpen: boolean) => setState({ complete, open: nextOpen })]
}
