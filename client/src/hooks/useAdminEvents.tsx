import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { useAdminWebSocket } from './useAdminWebSocket'

// Event types that can be subscribed to
export type AdminEventType = 
  | 'admin:user.signup'
  | 'admin:user.role.changed'
  | 'admin:user.role.assigned'
  | 'admin:user.banned'
  | 'admin:user.unbanned'
  | 'admin:user.suspended'
  | 'admin:user.unsuspended'
  | 'admin:user.verified'
  | 'admin:user.unverified'
  | 'admin:role.created'
  | 'admin:role.updated'
  | 'admin:role.deleted'
  | 'admin:creator.application.approved'
  | 'admin:creator.application.denied'
  | 'admin:report.resolved'
  | 'admin:appeal.decided'
  | 'admin:catalog.updated'
  | 'admin:promo.created'
  | 'admin:banner.created'
  | 'admin:feed.settings.changed'
  | 'admin:appeal.decided'
  | 'admin:creator.application.approved'
  | 'admin:creator.application.denied'
  | 'admin:report.resolved'

type AdminEventData = Record<string, unknown>

type Handler = (data: Record<string, unknown>) => void

const subscribersRef = new Map<string, Set<Handler>>()

export function subscribeAdminEvent(type: string, handler: Handler) {
  if (!subscribersRef.has(type)) {
    subscribersRef.set(type, new Set())
  }
  subscribersRef.get(type)!.add(handler)
  
  return () => {
    const subs = subscribersRef.get(type)
    if (subs) {
      subs.delete(handler)
      if (subs.size === 0) subscribersRef.delete(type)
    }
  }
}

function emitAdminEvent(type: string, data: Record<string, unknown>) {
  const subs = subscribersRef.get(type)
  if (subs) {
    subs.forEach(handler => {
      try {
        handler({ ...arguments[1], type, timestamp: Date.now() })
      } catch (e) {
        console.error(`[AdminEvents] Error in handler for ${type}:`, e)
      }
    })
  }
}

// Hook for components to subscribe to admin events
export function useAdminEvent(type: string, handler: (data: Record<string, unknown>) => void) {
  useEffect(() => {
    const unsubscribe = subscribeAdminEvent(type, handler)
    return unsubscribe
  }, [type, handler])
}

// Provider component that sets up the WebSocket and emits events
interface AdminEventsProviderProps {
  children: ReactNode
}

export function AdminEventsProvider({ children }: AdminEventsProviderProps) {
  return <>{children}</>
}

// Main hook that combines WebSocket connection with event emission
export function useAdminRealTime() {
  const handlersRef = useRef<Record<string, (data: Record<string, unknown>) => void>>({})
  
  // This hook will be used in AdminLayout to set up the WebSocket
  // and automatically forward events to subscribers
  useAdminWebSocket({
    'admin:user.signup': (data) => emitAdminEvent('admin:user.signup', data),
    'admin:user.role.changed': (data) => emitAdminEvent('admin:user.role.changed', data),
    'admin:user.role.assigned': (data) => emitAdminEvent('admin:user.role.assigned', data),
    'admin:user.banned': (data) => emitAdminEvent('admin:user.banned', data),
    'admin:user.unbanned': (data) => emitAdminEvent('admin:user.unbanned', data),
    'admin:user.suspended': (data) => emitAdminEvent('admin:user.suspended', data),
    'admin:user.unsuspended': (data) => emitAdminEvent('admin:user.unsuspended', data),
    'admin:user.verified': (data) => emitAdminEvent('admin:user.verified', data),
    'admin:user.unverified': (data) => emitAdminEvent('admin:user.unverified', data),
    'admin:role.created': (data) => emitAdminEvent('admin:role.created', data),
    'admin:role.updated': (data) => emitAdminEvent('admin:role.updated', data),
    'admin:role.deleted': (data) => emitAdminEvent('admin:role.deleted', data),
    'admin:creator.application.approved': (data) => emitAdminEvent('admin:creator.application.approved', data),
    'admin:creator.application.denied': (data) => emitAdminEvent('admin:creator.application.denied', data),
    'admin:report.resolved': (data) => emitAdminEvent('admin:report.resolved', data),
    'admin:appeal.decided': (data) => emitAdminEvent('admin:appeal.decided', data),
    'admin:catalog.updated': (data) => emitAdminEvent('admin:catalog.updated', data),
    'admin:promo.created': (data) => emitAdminEvent('admin:promo.created', data),
    'admin:banner.created': (data) => emitAdminEvent('admin:banner.created', data),
    'admin:feed.settings.changed': (data) => emitAdminEvent('admin:feed.settings.changed', data),
  })
}
 
// Event names for easy import
export const AdminEvents = {
  USER_SIGNUP: 'admin:user.signup' as const,
  USER_ROLE_CHANGED: 'admin:user.role.changed' as const,
  USER_ROLE_ASSIGNED: 'admin:user.role.assigned' as const,
  USER_BANNED: 'admin:user.banned' as const,
  USER_UNBANNED: 'admin:user.unbanned' as const,
  USER_SUSPENDED: 'admin:user.suspended' as const,
  USER_UNSUSPENDED: 'admin:user.unsuspended' as const,
  USER_VERIFIED: 'admin:user.verified' as const,
  USER_UNVERIFIED: 'admin:user.unverified' as const,
  ROLE_CREATED: 'admin:role.created' as const,
  ROLE_UPDATED: 'admin:role.updated' as const,
  ROLE_DELETED: 'admin:role.deleted' as const,
  CREATOR_APPROVED: 'admin:creator.application.approved' as const,
  CREATOR_DENIED: 'admin:creator.application.denied' as const,
  REPORT_RESOLVED: 'admin:report.resolved' as const,
  APPEAL_DECIDED: 'admin:appeal.decided' as const,
  CATALOG_UPDATED: 'admin:catalog.updated' as const,
  PROMO_CREATED: 'admin:promo.created' as const,
  BANNER_CREATED: 'admin:banner.created' as const,
  FEED_SETTINGS_CHANGED: 'admin:feed.settings.changed' as const,
} as const

export type AdminEventNames = typeof AdminEvents[keyof typeof AdminEvents]