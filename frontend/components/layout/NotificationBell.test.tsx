import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationBell } from './NotificationBell'

const mockUseNotifications = vi.fn()
const mockUseUnreadMessageCount = vi.fn()
const mockMarkAllNotificationsRead = vi.fn()
const mockIsAuthenticated = vi.fn()

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}))

vi.mock('@/hooks/useUnreadMessageCount', () => ({
  useUnreadMessageCount: () => mockUseUnreadMessageCount(),
}))

vi.mock('@/lib/notificationsApi', () => ({
  markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
}))

vi.mock('@/lib/auth', () => ({
  isAuthenticated: () => mockIsAuthenticated(),
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    mockIsAuthenticated.mockReturnValue(true)
    mockUseNotifications.mockReturnValue({
      unreadCount: 2,
      notifications: [{ id: 'n1', category: 'payment_due', title: 'Payment due', body: 'Your rent is due', createdAt: new Date().toISOString(), read: false }],
      isConnected: true,
    })
    mockUseUnreadMessageCount.mockReturnValue({ unreadCount: 1, isConnected: true })
    mockMarkAllNotificationsRead.mockResolvedValue(undefined)
  })

  it('renders nothing for unauthenticated users', () => {
    mockIsAuthenticated.mockReturnValue(false)

    const { container } = render(<NotificationBell />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the combined unread count and opens the notification menu', () => {
    render(<NotificationBell />)

    const trigger = screen.getByRole('button', { name: /Notifications, 2 unread notifications and 1 unread messages/i })
    expect(trigger).toHaveTextContent('3')

    fireEvent.click(trigger)

    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Payment due')).toBeInTheDocument()
  })
})
