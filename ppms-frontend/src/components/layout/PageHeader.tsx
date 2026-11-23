import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface Breadcrumb {
  label: string
  /** Leave out for the current page. */
  to?: string
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  breadcrumbs?: readonly Breadcrumb[]
  backLink?: { to: string; label: string }
  /** Status badges shown beside the title. */
  badges?: ReactNode
  /** Buttons or links shown left of the primary action. */
  secondaryActions?: ReactNode
  primaryAction?: ReactNode
  /** A PageTabs row under the title. */
  tabs?: ReactNode
}

/** The one page title block: h1, description, breadcrumbs or back link, badges, actions on the right and tabs underneath. */
export function PageHeader({ title, description, breadcrumbs, backLink, badges, secondaryActions, primaryAction, tabs }: PageHeaderProps) {
  const { t } = useTranslation()
  const hasActions = Boolean(secondaryActions || primaryAction)

  return (
    <div className="ui-page-head">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t('layout.breadcrumbs')} className="ui-breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb) => (
              <li key={crumb.label}>
                {crumb.to ? <Link to={crumb.to} className="ui-link">{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {backLink && (
        <Link to={backLink.to} className="ui-page-head__back">
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          {backLink.label}
        </Link>
      )}
      <div className="ui-page-head__row">
        <div className="ui-page-head__text">
          <div className="ui-page-head__title-row">
            <h1 className="ui-page-head__title">{title}</h1>
            {badges}
          </div>
          {description && <p className="ui-page-head__description">{description}</p>}
        </div>
        {hasActions && (
          <div className="ui-page-head__actions">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
      {tabs}
    </div>
  )
}
