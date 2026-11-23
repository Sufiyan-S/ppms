import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { StaffMember, UpdateStaffDetailsRequest, UserGender } from '../../../api/userApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { codeLabel } from '../../../constants/labels'
import { LanguagePicker } from '../../../components/LanguagePicker'
import { isAppLanguage } from '../../../i18n/languages'
import type { AppLanguage } from '../../../i18n/languages'
import { FormField } from '../../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { NightShiftConsentField } from './NightShiftConsentField'
import { RowPanel, RowPanelActions } from './RowPanel'

interface Props {
  pumpId: number
  member: StaffMember
  canAssignAdmin: boolean
  onClose: () => void
}

export function EditStaffPanel({ pumpId, member, canAssignAdmin, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const stillNeededId = useId()
  const [editFullName, setEditFullName]               = useState(member.fullName)
  const [editPhone, setEditPhone]                     = useState(member.phoneNumber ?? '')
  const [editRole, setEditRole]                       = useState<string>(member.role)
  const [editGender, setEditGender]                   = useState<UserGender | ''>((member.gender as UserGender | null) ?? '')
  const [editNightShiftConsent, setEditNightShiftConsent] = useState(member.nightShiftConsent)
  const [editLanguage, setEditLanguage]               = useState<AppLanguage>(isAppLanguage(member.preferredLanguage) ? member.preferredLanguage : 'en')
  const [editError, setEditError]                     = useState<string | null>(null)

  const detailsMutation = useMutation({
    mutationFn: ({ userId, req }: { userId: number; req: UpdateStaffDetailsRequest }) =>
      userApi.updateStaffDetails(userId, req),
    onSuccess: () => {
      setEditError(null)
      onClose()
      queryClient.invalidateQueries({ queryKey: ['staff', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['operators', pumpId] })
    },
    onError: (err) => setEditError(parseApiError(err, t('staff.edit.failed'))),
  })

  const stillNeeded = [
    ...(!editFullName.trim() ? [t('staff.fullName')] : []),
    ...(!editPhone.trim() ? [t('staff.phone')] : []),
    ...(!editRole ? [t('staff.role')] : []),
  ]

  const save = () => detailsMutation.mutate({
    userId: member.id,
    req: {
      fullName: editFullName.trim(),
      phoneNumber: editPhone.trim(),
      role: editRole as UpdateStaffDetailsRequest['role'],
      gender: editGender || undefined,
      nightShiftConsent: editRole === 'OPERATOR' && editGender === 'FEMALE'
        ? editNightShiftConsent
        : false,
      preferredLanguage: editLanguage,
    },
  })

  return (
    <RowPanel title={t('staff.edit.title', { name: member.fullName })}>
      <FormGrid>
        <FormField label={t('staff.fullName')}>
          <input type="text" value={editFullName} onChange={e => setEditFullName(e.target.value)} className="text-sm" />
        </FormField>
        <FormField label={t('staff.phone')} help={t('staff.phoneHelp')}>
          <input type="tel" inputMode="numeric" value={editPhone} onChange={e => setEditPhone(e.target.value)}
            maxLength={10} className="text-sm" />
        </FormField>
        <div>
          <span className="ui-label">{t('staff.role')}</span>
          <SearchableSelect label={t('staff.role')}
            value={editRole}
            onChange={v => {
              setEditRole(v)
              if (v !== 'OPERATOR') setEditNightShiftConsent(false)
            }}
            placeholder={t('staff.selectRole')}
            options={[
              { value: 'OPERATOR',   label: codeLabel('OPERATOR') },
              { value: 'MANAGER',    label: codeLabel('MANAGER') },
              ...(canAssignAdmin ? [{ value: 'ADMIN', label: codeLabel('ADMIN') }] : []),
              { value: 'ACCOUNTANT', label: codeLabel('ACCOUNTANT') },
            ]}
          />
        </div>
        <div>
          <span className="ui-label">{t('staff.gender')}</span>
          <SearchableSelect label={t('staff.gender')}
            value={editGender}
            onChange={v => {
              setEditGender(v as UserGender | '')
              if (v !== 'FEMALE') setEditNightShiftConsent(false)
            }}
            placeholder={t('staff.selectGender')}
            options={[
              { value: 'MALE',   label: codeLabel('MALE') },
              { value: 'FEMALE', label: codeLabel('FEMALE') },
              { value: 'OTHER',  label: codeLabel('OTHER') },
            ]}
          />
        </div>
        <LanguagePicker value={editLanguage} onChange={setEditLanguage} selectClassName="text-sm" />
        {editRole === 'OPERATOR' && editGender === 'FEMALE' && (
          <FormGridFullRow>
            <NightShiftConsentField checked={editNightShiftConsent} onChange={setEditNightShiftConsent} />
          </FormGridFullRow>
        )}
      </FormGrid>

      {editError && <p role="alert" className="ui-error-text">{editError}</p>}

      <RowPanelActions>
        <LoadingButton
          type="button"
          isLoading={detailsMutation.isPending}
          loadingLabel={t('common:actions.saving')}
          disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          onClick={save}
          className="ui-btn-primary ui-btn-compact"
        >
          {t('staff.edit.save')}
        </LoadingButton>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
      </RowPanelActions>
    </RowPanel>
  )
}
