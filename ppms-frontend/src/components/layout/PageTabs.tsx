import { Link, useSearchParams } from 'react-router-dom'

export interface PageTab {
  id: string
  label: string
}

interface PageTabsProps {
  /** Names the row for screen readers, e.g. "Shift history views". */
  label: string
  tabs: readonly PageTab[]
  activeTab: string
  /** Search parameter that holds the tab id. */
  param?: string
  /** Parameters that belong to one tab's view (filters, the selected row) and are dropped when switching tab. */
  resetParams?: readonly string[]
}

function searchForTab(current: URLSearchParams, param: string, tabId: string, resetParams: readonly string[]): string {
  const next = new URLSearchParams(current)
  for (const name of resetParams) next.delete(name)
  next.set(param, tabId)
  return `?${next.toString()}`
}

/**
 * Tabs kept in the address, so refresh, Back and shared links open the same view.
 * Each tab is a link; the open one carries aria-current="page".
 */
export function PageTabs({ label, tabs, activeTab, param = 'tab', resetParams = [] }: PageTabsProps) {
  const [searchParams] = useSearchParams()
  return (
    <nav aria-label={label} className="ui-page-tabs">
      <ul className="ui-tabbar ui-tabbar--flush">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <li key={tab.id}>
              <Link
                to={{ search: searchForTab(searchParams, param, tab.id, resetParams) }}
                replace
                aria-current={isActive ? 'page' : undefined}
                className={`ui-tabbar__button ${isActive ? 'ui-tabbar__button--active' : ''}`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
