import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function BackToLogin() {
  const { t } = useTranslation('auth')
  return <Link to="/login" className="ui-link text-sm">{t('backToLogin')}</Link>
}
