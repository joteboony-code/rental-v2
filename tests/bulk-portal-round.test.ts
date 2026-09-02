import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendBulkLineBillNotification } from '@/app/actions/line'

const mock = vi.hoisted(() => ({
  authorized: true,
  bills: [] as Record<string, unknown>[],
  rpc: vi.fn(), fetch: vi.fn(), insert: vi.fn(), revalidate: vi.fn(),
  filters: [] as [string, unknown][],
}))
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }))
vi.mock('@/lib/require-admin', () => ({ getAuthedUser: async () => mock.authorized ? { id: 'admin' } : null }))
vi.mock('@/app/actions/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/line-integration', () => ({ getLineMessagingConfig: async () => ({
  channelAccessToken: 'fake-test-token', liffId: 'test-liff', appUrl: null,
}) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  rpc: mock.rpc,
  from: (table: string) => {
    let data = table === 'bills' ? [...mock.bills] : []
    const chain = {
      select: () => chain,
      update: () => chain,
      eq: (key: string, value: unknown) => {
        mock.filters.push([key, value])
        if (key === 'billing_month') data = data.filter((b) => b.billing_month === value)
        if (key === 'tenant_id') data = data.filter((b) => b.tenant_id === value)
        if (key === 'status') data = data.filter((b) => b.status === value)
        return chain
      },
      in: (key: string, values: string[]) => {
        mock.filters.push([key, values])
        if (key === 'room_id') data = data.filter((b) => values.includes(b.room_id as string))
        if (key === 'tenant_id') data = data.filter((b) => values.includes(b.tenant_id as string))
        if (key === 'status') data = data.filter((b) => values.includes(b.status as string))
        return chain
      },
      lt: () => chain,
      order: () => chain,
      insert: mock.insert,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    }
    return chain
  },
}) }))

const room1 = '00000000-0000-0000-0000-000000000001'
const room2 = '00000000-0000-0000-0000-000000000002'
function bill(id: string, line: string | null) {
  return { id, room_id: id, tenant_id: `t-${id}`, status: 'pending', total_amount: 2500,
    billing_month: '2026-08-01', due_date: '2026-09-05', rent_amount: 2500,
    water_amount: 0, electricity_amount: 0, wifi_amount: 0, trash_amount: 0, other_amount: 0,
    tenants: { full_name: 'Test', line_user_id: line }, contracts: { line_recipient_user_id: null },
    rooms: { room_number: id.slice(-1), floor: 1 }, payments: [], meter_readings: null }
}
beforeEach(() => {
  mock.authorized = true
  mock.bills = [bill(room1, 'U1'), bill(room2, 'U2')]
  mock.filters = []
  mock.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name.includes('finish')
    ? { completed: true, activated: true, pending: 0 } : true, error: null }))
  mock.fetch.mockReset().mockResolvedValue({ ok: true })
  mock.insert.mockReset().mockResolvedValue({ error: null })
  mock.revalidate.mockReset()
  vi.stubGlobal('fetch', mock.fetch)
})

describe('bulk LINE portal round integration', () => {
  it('prepares before real send and records only successful deliveries, with their recipient', async () => {
    mock.bills[0].contracts = { line_recipient_user_id: 'U-override' }
    const result = await sendBulkLineBillNotification('2026-08-01', 'flex')
    expect(result.sent).toBe(2)
    expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.fetch.mock.invocationCallOrder[0])
    expect(mock.rpc).toHaveBeenCalledWith('admin_prepare_portal_bill_round', { p_billing_month: '2026-08-01', p_create: true })
    expect(mock.rpc.mock.calls[1][1].p_deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ bill_id: room1, line_user_id: 'U-override', started_at: expect.any(String) }),
    ]))
    expect(mock.revalidate).toHaveBeenCalledWith('/tenants')
  })
  it('includes old outstanding bills for a recipient who has only one room', async () => {
    const current = bill(room1, 'U1')
    current.total_amount = 3944
    const old = {
      ...bill('old-bill', 'U1'),
      id: 'old-bill',
      room_id: room1,
      tenant_id: current.tenant_id,
      billing_month: '2026-07-01',
      due_date: '2026-08-05',
      total_amount: 3722,
      rooms: current.rooms,
    }
    mock.bills = [current, old]

    const result = await sendBulkLineBillNotification('2026-08-01', 'flex')

    expect(result.sent).toBe(1)
    const request = JSON.parse(mock.fetch.mock.calls[0][1].body)
    const message = JSON.stringify(request.messages)
    expect(message).toContain('ยอดค้างเก่า')
    expect(message).toContain('3,722')
    expect(message).toContain('7,666')
  })
  it('preserves successful rooms when another room fails, and leaves the round inactive', async () => {
    mock.fetch.mockImplementation(async (_url, options) => {
      if (JSON.parse(options.body).to === 'U2') throw new Error('network')
      return { ok: true }
    })
    mock.rpc.mockImplementation(async (name: string) => ({ data: name.includes('finish')
      ? { completed: false, activated: false, pending: 1 } : true, error: null }))
    const result = await sendBulkLineBillNotification('2026-08-01', 'text')
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.message).toContain('ยังไม่เริ่มรอบ Portal')
    expect(mock.rpc.mock.calls[1][1].p_deliveries).toHaveLength(1)
    expect(mock.revalidate).not.toHaveBeenCalled()
  })
  it('retries only requested rooms without creating a new round', async () => {
    const result = await sendBulkLineBillNotification('2026-08-01', 'flex', [room2])
    expect(result.sent).toBe(1)
    expect(mock.rpc.mock.calls[0][1].p_create).toBe(false)
    expect(JSON.parse(mock.fetch.mock.calls[0][1].body).to).toBe('U2')
  })
  it('does not send anything when round preparation fails', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'migration missing' } })
    const result = await sendBulkLineBillNotification('2026-08-01', 'text')
    expect(result.success).toBe(false)
    expect(result.message).toContain('ยังไม่ได้ส่ง LINE')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('does not claim delivered LINE messages failed when recording the round fails', async () => {
    mock.rpc.mockImplementation(async (name: string) => ({ data: true,
      error: name.includes('finish') ? { message: 'db offline' } : null }))
    const result = await sendBulkLineBillNotification('2026-08-01', 'text')
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.message).toContain('บันทึกรอบ Portal ไม่สำเร็จ')
  })
  it('does not reset again on repeated sending in the same month', async () => {
    mock.rpc.mockImplementation(async (name: string) => ({ data: name.includes('finish')
      ? { completed: true, activated: false, pending: 0 } : true, error: null }))
    const result = await sendBulkLineBillNotification('2026-08-01', 'text')
    expect(result.message).toContain('ไม่รีเซ็ตการเปิด Portal ซ้ำ')
  })
  it('never records no-LINE rooms as delivered', async () => {
    mock.bills = [bill(room1, 'U1'), bill(room2, null)]
    const result = await sendBulkLineBillNotification('2026-08-01', 'text')
    expect(result.sent).toBe(1)
    expect(result.failures[0].retryable).toBe(false)
    expect(mock.rpc.mock.calls[1][1].p_deliveries).toHaveLength(1)
  })
  it('checks admin authorization and validates billing month before any tracking or send', async () => {
    mock.authorized = false
    await sendBulkLineBillNotification('2026-08-01', 'text')
    mock.authorized = true
    await sendBulkLineBillNotification('2026-99-01', 'text')
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})
