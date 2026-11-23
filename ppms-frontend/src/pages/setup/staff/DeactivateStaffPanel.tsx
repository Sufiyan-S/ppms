import { useTranslation } from 'react-i18next'
import type { StaffMember } from '../../../api/userApi'
import { RowPanel, RowPanelActions } from './RowPanel'

interface Props {
  member: StaffMember
  onConfirm: () => void
  onCancel: () => void
}

/** Asks before deactivating: the staff member is signed out and cannot sign in until activated again. */
export function DeactivateStaffPanel({ member, onConfirm, onCancel }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  return (
    <RowPanel title={t('staff.deactivate.title', { name: member.fullName })} hint={t('staff.deactivate.consequence', { name: member.fullName })}>
      <RowPanelActions>
        {/* Cancel comes first so the focus the panel opens with lands on the safe choice. */}
        <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <button type="button" onClick={onConfirm} className="ui-btn ui-btn-danger ui-btn-compact">
          {t('staff.deactivate.confirm')}
        </button>
      </RowPanelActions>
    </RowPanel>
  )
}
