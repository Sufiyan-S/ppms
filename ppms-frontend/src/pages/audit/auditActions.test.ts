import { describe, expect, it } from 'vitest'
import backendAuditActionSource from '../../../../ppms-backend/src/main/java/com/ppms/audit/AuditAction.java?raw'
import auditEnglish from '../../locales/en/audit.json'
import { AUDIT_ACTION_TONES, auditActionLabel } from './auditActions'

function backendAuditActions(): string[] {
  const enumBody = backendAuditActionSource.slice(backendAuditActionSource.indexOf('{') + 1)
  return [...enumBody.matchAll(/^\s+([A-Z][A-Z_]*)\s*[,}]?\s*$/gm)].map((match) => match[1])
}

describe('audit actions', () => {
  it('reads the actions from the backend enum', () => {
    expect(backendAuditActions()).toEqual(expect.arrayContaining(['USER_CREATED', 'DELIVERY_DELETED', 'SETTLEMENT_CONFIG_UPDATED']))
  })

  it('has a readable label and a tone for every backend action', () => {
    const labels: Record<string, string> = auditEnglish.actions
    const tones: Record<string, string> = AUDIT_ACTION_TONES
    for (const action of backendAuditActions()) {
      expect(labels[action], `label for ${action}`).toMatch(/^[A-Z][a-z]/)
      expect(tones[action], `tone for ${action}`).toBeTruthy()
    }
  })

  it('lists no action the backend does not have', () => {
    expect(Object.keys(auditEnglish.actions).sort()).toEqual([...backendAuditActions()].sort())
    expect(Object.keys(AUDIT_ACTION_TONES).sort()).toEqual([...backendAuditActions()].sort())
  })

  it('shows the translated label, or the code in words for an action it does not know', () => {
    expect(auditActionLabel('SHIFT_CLOSED')).toBe('Shift closed')
    expect(auditActionLabel('SOMETHING_NEW')).toBe('Something new')
  })
})
