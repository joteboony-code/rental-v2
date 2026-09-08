import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { BACKUP_TABLES, createRestoreSql } from '@/lib/backup-schema'

let db: PGlite
const tenant = '00000000-0000-4000-8000-000000000001'
const room = '00000000-0000-4000-8000-000000000002'
const contract = '00000000-0000-4000-8000-000000000003'
const bill1 = '00000000-0000-4000-8000-000000000004'
const bill2 = '00000000-0000-4000-8000-000000000005'
const slip = '00000000-0000-4000-8000-000000000006'
const group = '00000000-0000-4000-8000-000000000007'
const user = '00000000-0000-4000-8000-000000000008'
const setup = `
create role anon; create role authenticated; create role service_role;
create table tenants(id uuid primary key,line_user_id text);
create table rooms(id uuid primary key);
create table contracts(id uuid primary key,tenant_id uuid references tenants,room_id uuid references rooms,status text,line_recipient_user_id text);
create table bills(id uuid primary key,contract_id uuid references contracts,tenant_id uuid references tenants,room_id uuid references rooms,total_amount numeric,status text,due_date date,billing_month date);
create table payments(id uuid primary key default gen_random_uuid(),bill_id uuid references bills,amount numeric check(amount>0),payment_method text,slip_url text,slip_ref text,note text,paid_at timestamptz,recorded_by uuid,payment_group_id uuid,created_at timestamptz default now());
create unique index payment_ref on payments(slip_ref,bill_id) where slip_ref is not null;
create table pending_slips(id uuid primary key,tenant_id uuid,room_id uuid,line_user_id text,status text,slip_url text,slip_ref text,reviewed_at timestamptz,reviewed_by uuid,admin_note text);
create table tenant_credits(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,room_id uuid references rooms,amount numeric check(amount>0),slip_url text,slip_ref text,note text,status text,created_by uuid);
insert into tenants values('${tenant}','line-test'); insert into rooms values('${room}');
insert into contracts values('${contract}','${tenant}','${room}','active',null);
insert into bills values('${bill1}','${contract}','${tenant}','${room}',100,'pending','2026-07-05','2026-06-01'),('${bill2}','${contract}','${tenant}','${room}',200,'pending','2026-08-05','2026-07-01');
insert into pending_slips(id,tenant_id,status,slip_url,slip_ref) values('${slip}','${tenant}','pending','evidence.jpg','bank-ref');
`
beforeEach(async () => {
  db = new PGlite()
  await db.exec(setup)
  await db.exec(readFileSync('supabase/migrations/202609040002_atomic_manual_payments.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/202609070001_atomic_slip_payments.sql', 'utf8'))
}, 30_000)
afterEach(async () => { await db.close() })
async function count(table: string) { return Number((await db.query<{ n: number }>(`select count(*) n from ${table}`)).rows[0].n) }
const multi = (items: { id: string; amount: number }[], ref = 'auto-ref') => db.query(
  'select apply_multi_bill_payment($1::jsonb,$2,null,$3,null,now(),$4::uuid) result', [JSON.stringify(items), 'transfer', ref, group])

describe('payment migrations executed by PostgreSQL (PGlite)', () => {
  it('exports all required tables using the consistent snapshot RPC', async () => {
    for (const table of BACKUP_TABLES) await db.exec(`create table if not exists ${table}(id uuid primary key)`)
    await db.exec(readFileSync('supabase/migrations/202609070002_consistent_backup.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/202609080001_optional_legacy_page_views_backup.sql', 'utf8'))
    const result = await db.query<{ result: { tables: Record<string, unknown[]> } }>('select admin_export_application_backup() result')
    expect(Object.keys(result.rows[0].result.tables)).toHaveLength(BACKUP_TABLES.length)
    expect(result.rows[0].result.tables.bills).toHaveLength(2)
  })
  it('reproduces and fixes exports on installations without the retired page_views table', async () => {
    for (const table of BACKUP_TABLES.filter(name => name !== 'page_views')) {
      await db.exec(`create table if not exists ${table}(id uuid primary key)`)
    }
    await db.exec(readFileSync('supabase/migrations/202609070002_consistent_backup.sql', 'utf8'))
    await expect(db.query('select admin_export_application_backup()')).rejects.toThrow('page_views')
    await db.exec(readFileSync('supabase/migrations/202609080001_optional_legacy_page_views_backup.sql', 'utf8'))
    const result = await db.query<{ result: { tables: Record<string, unknown[]> } }>('select admin_export_application_backup() result')
    expect(Object.keys(result.rows[0].result.tables)).toHaveLength(BACKUP_TABLES.length - 1)
    expect(result.rows[0].result.tables).not.toHaveProperty('page_views')
    expect(result.rows[0].result.tables).toHaveProperty('settings')
    await db.exec('drop table profiles')
    await expect(db.query('select admin_export_application_backup()')).rejects.toThrow('profiles')
  })
  it('escapes restore SQL delimiters in user-entered data', async () => {
    const text = "$rental_restore$'; drop table rooms; --"
    await db.exec('truncate payments,bills,contracts,tenants,rooms cascade')
    await db.exec(createRestoreSql({ version: 1, exportedAt: new Date().toISOString(), tables: {
      tenants: [{ id: tenant, line_user_id: text }],
    } }))
    expect((await db.query<{ line_user_id: string }>('select line_user_id from tenants')).rows[0].line_user_id).toBe(text)
    expect(await count('rooms')).toBe(0)
  })
  it('rolls back ALL payments and statuses when a later bill exceeds balance', async () => {
    await expect(multi([{ id: bill1, amount: 100 }, { id: bill2, amount: 201 }])).rejects.toThrow('exceeds')
    expect(await count('payments')).toBe(0)
    expect((await db.query<{ status: string }>('select status from bills')).rows.every(b => b.status === 'pending')).toBe(true)
  })
  it('commits oldest-first allocation and claims the slip together; rejects a replay', async () => {
    const sql = 'select admin_approve_slip_oldest_first($1,$2,$3,$4,now(),$5,null,$6) result'
    const args = [slip, tenant, 'line-test', 250, 'transfer', user]
    await db.query(sql, args)
    expect((await db.query<{ amount: string }>('select amount from payments order by amount')).rows.map(r => Number(r.amount))).toEqual([100,150])
    expect((await db.query<{ status: string }>('select status from pending_slips')).rows[0].status).toBe('approved')
    await expect(db.query(sql, args)).rejects.toThrow('unavailable')
    expect(await count('payments')).toBe(2)
  })
  it('keeps pending slip untouched when oldest-first exceeds available debt', async () => {
    await expect(db.query(`select admin_approve_slip_oldest_first('${slip}','${tenant}',null,301,now(),'transfer',null,'${user}')`)).rejects.toThrow('exceeds')
    expect(await count('payments')).toBe(0)
    expect((await db.query<{ status: string }>('select status from pending_slips')).rows[0].status).toBe('pending')
  })
  it('rejects a webhook allocation after an owner payment consumes the balance', async () => {
    await db.query(`select admin_record_payment('${bill1}',80,'cash',null,null,now(),'${user}')`)
    await expect(multi([{ id: bill1, amount: 100 }])).rejects.toThrow('exceeds')
    expect(await count('payments')).toBe(1)
  })
  it('rolls back bill payments when the associated credit insert fails', async () => {
    await expect(db.query(`select apply_multi_bill_payment_with_credit($1,'transfer',null,'credit-ref',null,now(),'${group}',10,'99999999-0000-4000-8000-000000000001',null)`,[JSON.stringify([{id:bill1,amount:100}])])).rejects.toThrow()
    expect(await count('payments')).toBe(0)
    expect(await count('tenant_credits')).toBe(0)
  })
  it('commits advance credit atomically and prevents reuse on another bill', async () => {
    await db.query(`select admin_save_slip_as_advance('${slip}','${tenant}','${room}',100,null,'${user}')`)
    await expect(multi([{id:bill1,amount:100}], 'bank-ref')).rejects.toThrow('already recorded')
    expect(await count('tenant_credits')).toBe(1)
    expect(await count('payments')).toBe(0)
  })
  it('deleting payment preserves shared slip evidence and restores overdue status', async () => {
    const result = await db.query<{ result: { payment_id: string } }>(`select admin_approve_pending_slip('${slip}','${bill1}',100,'transfer',now(),null,'${user}') result`)
    const deleted = await db.query<{ result: { slip_in_use: boolean } }>('select admin_delete_payment($1,$2) result',[result.rows[0].result.payment_id,bill1])
    expect(deleted.rows[0].result.slip_in_use).toBe(true)
    expect((await db.query<{ status: string }>('select status from bills where id=$1',[bill1])).rows[0].status).toBe('overdue')
  })
  it('denies payment RPC execution to the tenant role', async () => {
    await db.exec('set role authenticated')
    await expect(multi([{id:bill1,amount:100}])).rejects.toThrow('permission denied')
    await db.exec('reset role')
  })
  it('restores FK-dependent tables in a fresh target and refuses existing data', async () => {
    const backup = { version: 1, exportedAt: new Date().toISOString(), tables: {
      payments: (await db.query('select * from payments')).rows,
      bills: (await db.query('select * from bills')).rows,
      contracts: (await db.query('select * from contracts')).rows,
      tenants: (await db.query('select * from tenants')).rows,
      rooms: (await db.query('select * from rooms')).rows,
    } }
    const sql = createRestoreSql(backup)
    await expect(db.exec(sql)).rejects.toThrow('empty target')
    await db.exec('rollback; truncate payments,bills,contracts,tenants,rooms cascade')
    await db.exec(sql)
    expect(await count('bills')).toBe(2)
    expect(await count('contracts')).toBe(1)
  })
})
