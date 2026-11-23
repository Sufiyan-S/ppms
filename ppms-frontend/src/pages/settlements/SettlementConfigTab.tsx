import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BellOff, BellRing, Check } from 'lucide-react'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { SettlementPaymentType, UpdateConfigRequest } from '../../api/paymentSettlementApi'
import { Spinner } from '../../components/Spinner'
import { StatusBadge } from '../../components/StatusBadge'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { TYPE_ACCENT, TYPE_ICONS, typeLabel } from './settlementFormat'

interface SettlementConfigTabProps {
  pumpId: number
  canConfigure: boolean
}

export function SettlementConfigTab({ pumpId, canConfigure }: SettlementConfigTabProps) {
  const { t } = useTranslation(['settlements', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['settlement-configs', pumpId],
    queryFn:  () => paymentSettlementApi.getConfigs(pumpId),
    enabled:  !!pumpId,
  })

  const [configEdits, setConfigEdits]   = useState<Record<string, UpdateConfigRequest>>({})
  const [savingConfig, setSavingConfig] = useState<string | null>(null)

  const handleConfigChange = <K extends keyof UpdateConfigRequest>(type: SettlementPaymentType, field: K, value: UpdateConfigRequest[K]) => {
    setConfigEdits(prev => ({
      ...prev,
      [type]: { ...(prev[type] ?? { alertTime: '18:00', enabled: true }), [field]: value },
    }))
  }

  const saveConfig = async (type: SettlementPaymentType) => {
    const current = configs.find(c => c.paymentType === type)
    const edit    = configEdits[type]
    if (!edit) return
    setSavingConfig(type)
    try {
      await paymentSettlementApi.upsertConfig(pumpId, type, {
        alertTime: edit.alertTime ?? current?.alertTime ?? '18:00',
        enabled:   edit.enabled  ?? current?.enabled   ?? true,
      })
      qc.invalidateQueries({ queryKey: ['settlement-configs', pumpId] })
      setConfigEdits(prev => { const next = { ...prev }; delete next[type]; return next })
      addToast(t('alerts.saved', { type: typeLabel(type) }), 'success')
    } catch (err) {
      addToast(parseApiError(err, t('alerts.saveFailed')), 'error')
    } finally {
      setSavingConfig(null)
    }
  }

  return (
    <div className="space-y-3">
      {loadingConfigs ? (
        <div className="flex items-center gap-2 text-ink-3 text-sm"><Spinner /> {t('common:loading.short')}</div>
      ) : (
        configs.map(cfg => {
          const edit      = configEdits[cfg.paymentType]
          const alertTime = edit?.alertTime ?? cfg.alertTime
          const enabled   = edit?.enabled   ?? cfg.enabled
          const isDirty   = !!edit
          const accent    = TYPE_ACCENT[cfg.paymentType]

          return (
            <div key={cfg.paymentType} className="ui-dashboard-module px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-9 h-9 ${accent.icon} rounded-card flex items-center justify-center text-on-primary text-base shadow-raised flex-shrink-0`}>
                  {TYPE_ICONS[cfg.paymentType]}
                </div>
                <div>
                  <p className="font-semibold text-ink text-sm">{typeLabel(cfg.paymentType)}</p>
                  <p className="text-xs text-ink-3">{t('alerts.dailyReminder')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <input aria-label={t('alerts.reminderTime', { type: typeLabel(cfg.paymentType) })}
                  type="time"
                  value={alertTime}
                  disabled={!canConfigure}
                  onChange={e => handleConfigChange(cfg.paymentType, 'alertTime', e.target.value)}
                  className="ui-input w-36 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!canConfigure}
                    onChange={e => handleConfigChange(cfg.paymentType, 'enabled', e.target.checked)}
                    className="rounded accent-primary w-4 h-4"
                  />
                  {t('alerts.enabled')}
                </label>
                {canConfigure && isDirty && (
                  <button
                    onClick={() => saveConfig(cfg.paymentType)}
                    disabled={savingConfig === cfg.paymentType}
                    className="ui-btn ui-btn-primary"
                  >
                    {savingConfig === cfg.paymentType
                      ? <><Spinner /><span>{t('common:actions.saving')}</span></>
                      : <><Check size={14} strokeWidth={2.5} aria-hidden="true" /><span>{t('common:actions.save')}</span></>}
                  </button>
                )}
                {!isDirty && (
                  <StatusBadge tone={enabled ? 'ok' : 'neutral'} icon={enabled ? BellRing : BellOff} label={enabled ? t('alerts.active') : t('alerts.disabled')} />
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
