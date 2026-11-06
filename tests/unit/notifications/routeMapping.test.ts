import { describe, it, expect } from 'vitest'
import { resolveNotificationRoute } from '@/features/notifications/utils/routeMapping'

describe('resolveNotificationRoute', () => {
  it('maps /claims and subpaths to /admin/claims', () => {
    expect(resolveNotificationRoute('/claims')).toBe('/admin/claims')
    expect(resolveNotificationRoute('/claims/123')).toBe('/admin/claims')
  })

  it('maps /verification, /verifications and subpaths to /admin/verifications', () => {
    expect(resolveNotificationRoute('/verification')).toBe('/admin/verifications')
    expect(resolveNotificationRoute('/verifications')).toBe('/admin/verifications')
    expect(resolveNotificationRoute('/verification/123')).toBe('/admin/verifications')
  })

  it('maps /community/groups to /community', () => {
    expect(resolveNotificationRoute('/community/groups')).toBe('/community')
    expect(resolveNotificationRoute('/community/groups/vadodara-youth')).toBe('/community')
  })

  it('maps /community/events to /community?tab=events', () => {
    expect(resolveNotificationRoute('/community/events')).toBe('/community?tab=events')
    expect(resolveNotificationRoute('/community/events/456')).toBe('/community?tab=events')
  })

  it('maps /family/media and /family/history to /families', () => {
    expect(resolveNotificationRoute('/family/media')).toBe('/families')
    expect(resolveNotificationRoute('/family/history')).toBe('/families')
  })

  it('preserves valid standard routes', () => {
    expect(resolveNotificationRoute('/people/123')).toBe('/people/123')
    expect(resolveNotificationRoute('/families/456')).toBe('/families/456')
  })

  it('rejects null, empty, external or malicious URLs', () => {
    expect(resolveNotificationRoute(null)).toBeNull()
    expect(resolveNotificationRoute('')).toBeNull()
    expect(resolveNotificationRoute('https://malicious.com')).toBeNull()
    expect(resolveNotificationRoute('//malicious.com')).toBeNull()
  })
})
