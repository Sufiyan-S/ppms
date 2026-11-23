import { useSearchParams } from 'react-router-dom'

/** The tab named in the address, or the default when it is missing or not one of the tabs. */
export function useActiveTab<Tab extends string>(tabIds: readonly Tab[], defaultTab: Tab, param = 'tab'): Tab {
  const [searchParams] = useSearchParams()
  const value = searchParams.get(param)
  return tabIds.find((id) => id === value) ?? defaultTab
}
