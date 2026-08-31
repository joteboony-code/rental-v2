import { describe, expect, it } from 'vitest'
import { portalReadStatus, type PortalReadDelivery } from '@/lib/portal-read-status'

const delivery: PortalReadDelivery = {
  tenant_id: 'tenant', room_id: 'room',
  first_sent_started_at: '2026-08-31T09:00:00Z',
  sent_at: '2026-08-31T09:00:05Z', last_open_at: null,
}

describe('portal read badge', () => {
  it('keeps the legacy badge until a completed bulk round exists', () => {
    expect(portalReadStatus('2026-07-01', null, []).opened).toBe(true)
    expect(portalReadStatus(null, null, []).label).toBe('ยังไม่เปิด Portal')
  })
  it('does not carry old portal opens into the new round', () => {
    expect(portalReadStatus('2026-07-01', '2026-08-01', [delivery]).label).toBe('ยังไม่เปิด Portal รอบนี้')
    expect(portalReadStatus(null, '2026-08-01', [{ ...delivery, last_open_at: '2026-08-31T08:59:59Z' }]).opened).toBe(false)
  })
  it('counts an opening during the successful LINE request, before batch completion', () => {
    expect(portalReadStatus(null, '2026-08-01', [{ ...delivery, last_open_at: '2026-08-31T09:00:02Z' }]).opened).toBe(true)
  })
  it('counts at or after the send cutoff without relying on the calendar month', () => {
    expect(portalReadStatus(null, '2026-08-01', [{ ...delivery, last_open_at: delivery.first_sent_started_at }]).opened).toBe(true)
    expect(portalReadStatus(null, '2026-08-01', [{ ...delivery, last_open_at: '2026-09-01T00:00:00Z' }]).opened).toBe(true)
  })
  it('labels excluded recipients rather than claiming they have not read a sent bill', () => {
    expect(portalReadStatus('2026-08-31', '2026-08-01', []).label).toBe('ไม่ได้ส่งบิลรอบนี้')
  })
  it('does not show old green badges when tracking data cannot be loaded', () => {
    expect(portalReadStatus('2026-08-31', null, [], false)).toEqual({ opened: false, label: 'โหลดสถานะ Portal ไม่สำเร็จ' })
  })
})
