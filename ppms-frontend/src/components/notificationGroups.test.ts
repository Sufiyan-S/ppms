import { afterEach, describe, expect, it } from 'vitest'
import type { Notification } from '../api/notificationApi'
import { groupIdenticalNotifications, notificationText } from './notificationGroups'
import { changeAppLanguage } from '../i18n'

function reminder(id: number, createdAt: string, title = 'UPI Settlement Reminder'): Notification {
  return {
    id, pumpId: 3, type: 'SETTLEMENT_REMINDER', title, message: "Record today's UPI settlement", createdAt,
    read: false, target: { route: '/dashboard/settlements', params: {} },
  }
}

describe('groupIdenticalNotifications', () => {
  it('shows identical alerts once with their count, keeping the newest and every id', () => {
    const groups = groupIdenticalNotifications([
      reminder(1, '2026-11-22T12:30:00Z'),
      reminder(2, '2026-11-23T12:30:00Z'),
      reminder(3, '2026-11-23T12:30:00Z', 'Card Settlement Reminder'),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({ latest: expect.objectContaining({ id: 2 }), count: 2, ids: [1, 2] })
    expect(groups[1]).toEqual({ latest: expect.objectContaining({ id: 3 }), count: 1, ids: [3] })
  })
})

describe('notificationText', () => {
  const lowStock = (code: string | null): Notification => ({
    ...reminder(7, '2026-11-23T12:30:00Z'),
    type: 'LOW_STOCK',
    title: 'Low Tank Stock',
    message: 'T1 (DIESEL) is at 12.5% — delivery needed.',
    code,
    params: code ? { tankName: 'T1', fuelTypeCode: 'DIESEL', stockPercent: '12.5' } : null,
  })

  afterEach(async () => {
    await changeAppLanguage('en')
  })

  it('shows the stored English title and message to English users', () => {
    expect(notificationText(lowStock('LOW_STOCK'))).toEqual({
      title: 'Low Tank Stock', message: 'T1 (DIESEL) is at 12.5% — delivery needed.',
    })
  })

  it('builds the title and message in the user\'s language from the code and params', async () => {
    await changeAppLanguage('hi')
    expect(notificationText(lowStock('LOW_STOCK'))).toEqual({
      title: 'टैंक में स्टॉक कम', message: 'T1 (डीज़ल) में 12.5% स्टॉक बचा है — डिलीवरी मँगवाएँ।',
    })
  })

  it('falls back to the stored English for notifications saved without a code', async () => {
    await changeAppLanguage('mr')
    expect(notificationText(lowStock(null)).title).toBe('Low Tank Stock')
  })
})
