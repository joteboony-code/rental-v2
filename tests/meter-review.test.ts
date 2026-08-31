import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeterReviewPage from '@/app/(dashboard)/bills/meter/review/page'

const mock = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  errorTable: '',
  eq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => {
        const result = { data: mock.tables[table] ?? [], error: mock.errorTable === table ? { message: 'offline' } : null }
        return { ...result, eq: (key: string, value: string) => { mock.eq(table, key, value); return result } }
      },
    }),
  }),
}))

beforeEach(() => {
  vi.stubGlobal('React', React)
  mock.errorTable = ''
  mock.eq.mockClear()
  mock.tables = {
    rooms: [{ id: 'r10', room_number: '10' }, { id: 'r2', room_number: '2' }],
    contracts: [{ room_id: 'r2', tenants: { full_name: 'ผู้เช่าปัจจุบัน' } }],
    bills: [{ room_id: 'r10', tenants: { full_name: 'ผู้เช่าของบิลเดิม' } }],
    meter_readings: [{ room_id: 'r10', water_prev: 0, water_curr: 0, electricity_prev: '8238', electricity_curr: '8318', water_image_url: 'https://example.com/water.jpg', electricity_image_url: null }],
  }
})

describe('meter review page', () => {
  it('renders saved readings and full-width photos without image links or cropping', async () => {
    const html = renderToStaticMarkup(await MeterReviewPage({ searchParams: Promise.resolve({ month: '2026-08' }) }))
    expect(html).toContain('8,318')
    expect(html).toContain('8,238')
    expect(html).toContain('เทียบกับเลขที่บันทึก 0')
    expect(html).toContain('class="block h-auto w-full"')
    expect(html).not.toContain('href="https://example.com/water.jpg"')
    expect(html).not.toContain('object-cover')
    expect(mock.eq).toHaveBeenCalledWith('meter_readings', 'billing_month', '2026-08-01')
  })

  it('includes historical rooms and marks unsaved rooms and missing photos clearly', async () => {
    const html = renderToStaticMarkup(await MeterReviewPage({ searchParams: Promise.resolve({ month: '2026-08' }) }))
    expect(html).toContain('ผู้เช่าของบิลเดิม')
    expect(html).toContain('ยังไม่ได้บันทึกมิเตอร์เดือนนี้')
    expect(html).toContain('ยังไม่มีรูปมิเตอร์ไฟฟ้าของเดือนนี้')
    expect(html.indexOf('ห้อง 2')).toBeLessThan(html.indexOf('ห้อง 10'))
  })

  it('rejects malformed month parameters', async () => {
    await MeterReviewPage({ searchParams: Promise.resolve({ month: '2026-99' }) })
    expect(mock.eq).not.toHaveBeenCalledWith('meter_readings', 'billing_month', '2026-99-01')
  })

  it('reports query failures instead of presenting missing data as zero', async () => {
    mock.errorTable = 'meter_readings'
    await expect(MeterReviewPage({ searchParams: Promise.resolve({ month: '2026-08' }) })).rejects.toThrow('โหลดข้อมูลตรวจทานมิเตอร์ไม่สำเร็จ')
  })
})
