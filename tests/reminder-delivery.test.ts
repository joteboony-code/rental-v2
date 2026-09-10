import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTrackedReminder } from '@/lib/reminder-delivery'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const row = { reminder_date: '2026-09-10', recipient_key: 'recipient', rooms: ['21'], bill_ids: [], amount: 123 }
function database() {
  let state: string | null = null
  const db = { from: () => ({
    insert: () => ({ select: () => ({ single: async () => {
      if (state) return { data: null, error: { code: '23505' } }
      state = 'sending'; return { data: { id: 'id' }, error: null }
    } }) }),
    update: (value: { status: string }) => {
      const filters: Record<string,string> = {}
      const chain = {
        eq: (k: string, v: string) => { filters[k] = v; return chain },
        select: () => chain,
        maybeSingle: async () => {
          if (state !== filters.status) return { data: null, error: null }
          state = value.status; return { data: { id: 'id' }, error: null }
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (state === filters.status) state = value.status
          return Promise.resolve(resolve({ error: null }))
        },
      }; return chain
    },
  }) } as unknown as SupabaseClient
  return { db, state: () => state }
}
afterEach(() => vi.unstubAllGlobals())
describe('recipient reminder delivery', () => {
  it('sends once across concurrent requests and repeat runs', async () => {
    const { db, state } = database()
    const push = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', push)
    await Promise.all([1,2,3].map(() => sendTrackedReminder(db,row,'user','token',[])))
    await sendTrackedReminder(db,row,'user','token',[])
    expect(push).toHaveBeenCalledTimes(1); expect(state()).toBe('accepted')
  })
  it.each(['network', 'server'])('never replays uncertain %s responses', async kind => {
    const { db, state } = database()
    const push = vi.fn(async () => { if (kind === 'network') throw new Error('timeout'); return new Response('',{status:500}) })
    vi.stubGlobal('fetch', push)
    await sendTrackedReminder(db,row,'user','token',[])
    await sendTrackedReminder(db,row,'user','token',[])
    expect(push).toHaveBeenCalledTimes(1); expect(state()).toBe('unknown')
  })
  it('allows explicit rejected requests to retry safely', async () => {
    const { db, state } = database()
    const push = vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValue(new Response('',{status:200}))
    vi.stubGlobal('fetch',push)
    expect(await sendTrackedReminder(db,row,'user','token',[])).toBe('failed')
    await Promise.all([1,2].map(() => sendTrackedReminder(db,row,'user','token',[])))
    expect(push).toHaveBeenCalledTimes(2); expect(state()).toBe('accepted')
  })
  it('fails closed if persistence is unavailable', async () => {
    const db = { from: () => ({insert: () => ({select: () => ({single: async () => ({error:{code:'42P01'}})})})}) } as unknown as SupabaseClient
    const push=vi.fn();vi.stubGlobal('fetch',push)
    await expect(sendTrackedReminder(db,row,'user','token',[])).rejects.toThrow('claim')
    expect(push).not.toHaveBeenCalled()
  })
  it('migration enforces uniqueness and blocks non-admin reads/writes', async () => {
    const db = new PGlite()
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
        create function public.is_admin() returns boolean language sql as $$select false$$;
        create table line_integrations(bill_reminder_notify_enabled boolean);
        create table settings(id int, notify_reminder_summary_enabled boolean);`)
      await db.exec(readFileSync('supabase/migrations/202609090001_reminder_deliveries.sql','utf8'))
      await db.exec(`insert into reminder_deliveries(reminder_date,recipient_key,status) values ('2026-09-10','user','sending')`)
      await expect(db.exec(`insert into reminder_deliveries(reminder_date,recipient_key,status) values ('2026-09-10','user','sending')`)).rejects.toThrow('unique')
      await db.exec('set role authenticated')
      expect((await db.query('select * from reminder_deliveries')).rows).toHaveLength(0)
      await expect(db.exec(`delete from reminder_deliveries`)).rejects.toThrow('permission')
    } finally { await db.close() }
  }, 30000)
})
