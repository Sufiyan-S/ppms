import { PHONE_QUERY } from '../constants/breakpoints'
import { useMediaQuery } from './useMediaQuery'

/** True at the same width where the dashboard switches to its phone layout. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}
