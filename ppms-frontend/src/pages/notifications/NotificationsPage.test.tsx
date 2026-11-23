import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from '../../api/notificationApi'
import type { Notification } from '../../api/notificationApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import NotificationsPage from './NotificationsPage'

vi.mock('../../api/notificationApi', () => ({
  notificationApi: { getHistory: vi.fn(), getNotifications: vi.fn(), markRead: vi.fn() },
}))

const unread: Notification = {
  id: 1, pumpId: 4, type: 'SETTLEMENT_REMINDER', title: 'UPI Settlement Reminder', message: 'Record UPI',
  createdAt: '2026-11-23T10:00:00Z', read: false, target: { route: '/dashboard/settlements', params: {} },
}
const read: Notification = { ...unread, id: 2, type: 'LOW_STOCK', title: 'Low Tank Stock', read: true,
  target: { route: '/dashboard/inventory', params: {} } }

function CurrentSearch() {
  return <output aria-label="Address search">{useLocation().search}</output>
}

function page(content: Notification[]) {
  return { content, page: 0, pageSize: 20, totalElements: content.length, totalPages: 1, hasNext: false, hasPrevious: false }
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 4 })
    vi.mocked(notificationApi.getHistory).mockResolvedValue(page([unread, read]))
    vi.mocked(notificationApi.getNotifications).mockResolvedValue({ notifications: [unread], unreadCount: 1 })
    vi.mocked(notificationApi.markRead).mockResolvedValue(undefined)
  })

  it('lists read and unread notifications with their state in words', async () => {
    renderWithProviders(<NotificationsPage />)

    expect(await screen.findByText('UPI Settlement Reminder')).toBeInTheDocument()
    const list = screen.getByRole('list')
    expect(within(list).getByText('Unread')).toBeInTheDocument()
    expect(within(list).getByText('Read')).toBeInTheDocument()
    expect(notificationApi.getHistory).toHaveBeenCalledWith(4, 0, 20, undefined)
  })

  it('filters by type', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotificationsPage />)
    await screen.findByText('UPI Settlement Reminder')

    await user.selectOptions(screen.getByLabelText('Type'), 'LOW_STOCK')

    await waitFor(() => expect(notificationApi.getHistory).toHaveBeenLastCalledWith(4, 0, 20, 'LOW_STOCK'))
  })

  it('marks an unread notification read when it is opened', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotificationsPage />)

    await user.click(await screen.findByRole('link', { name: /UPI Settlement Reminder/ }))

    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith(4, [1]))
  })

  it('shows only unread notifications when the unread filter is on, and keeps it in the address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><NotificationsPage /><CurrentSearch /></>)
    await screen.findByText('Low Tank Stock')

    await user.click(within(screen.getByRole('group', { name: 'Read or unread' })).getByRole('button', { name: 'Unread' }))

    expect(screen.getByRole('button', { name: 'Unread' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('UPI Settlement Reminder')).toBeInTheDocument()
    expect(screen.queryByText('Low Tank Stock')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?status=unread')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Low Tank Stock')).toBeInTheDocument()
  })

  it('opens with the type filter named in the address', async () => {
    renderWithProviders(<NotificationsPage />, { route: '/dashboard/notifications?type=LOW_STOCK' })

    await waitFor(() => expect(notificationApi.getHistory).toHaveBeenCalledWith(4, 0, 20, 'LOW_STOCK'))
    expect(screen.getByLabelText('Type')).toHaveValue('LOW_STOCK')
  })
})
