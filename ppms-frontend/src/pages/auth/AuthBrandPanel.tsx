import { Fuel } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ForecourtIllustration } from './ForecourtIllustration'

export interface BrandMessage {
  tagline: string
  supportingLine: string
}

/** The brand half of every sign-in screen; on phones it shrinks to a header above the form. */
export function AuthBrandPanel({ message }: { message?: BrandMessage }) {
  const { t } = useTranslation('auth')
  const { tagline, supportingLine } = message ?? { tagline: t('brand.tagline'), supportingLine: t('brand.supportingLine') }
  return (
    <div className="ui-auth-brand">
      <p className="ui-auth-brand__logo">
        <span className="ui-auth-brand__mark">
          <Fuel size={20} strokeWidth={2.2} aria-hidden="true" />
        </span>
        PPMS
      </p>
      <ForecourtIllustration className="ui-auth-brand__art" />
      <div className="ui-auth-brand__text">
        <p className="ui-auth-brand__tagline">{tagline}</p>
        <p className="ui-auth-brand__line">{supportingLine}</p>
      </div>
    </div>
  )
}
