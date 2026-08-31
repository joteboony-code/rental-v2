// SQL integration test in an isolated, in-memory PostgreSQL (PGlite).
// Set PGLITE_MODULE_PATH to an installed @electric-sql/pglite/dist/index.js.
// No production connection, credentials or LINE requests are used.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const month = '2026-08-01'
let checks = 0
const check = (value, expected) => { assert.deepEqual(value, expected); checks++ }
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
const prepare = (m = month, create = true) => scalar('select admin_prepare_portal_bill_round($1, $2)', [m, create])
const finish = (deliveries, m = month) => scalar('select admin_finish_portal_bill_round($1, $2)', [m, JSON.stringify(deliveries)])
const sent = (n, started = '2026-08-31T09:00:00Z') => ({ bill_id: id(400 + n), line_user_id: `U${n}`, started_at: started })
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'true' $$;
    create table tenants (id uuid primary key, line_user_id text, last_portal_open_at timestamptz);
    create table rooms (id uuid primary key);
    create table contracts (id uuid primary key, line_recipient_user_id text);
    create table bills (id uuid primary key, tenant_id uuid, room_id uuid, contract_id uuid, billing_month date, status text, total_amount numeric);
    create table payments (bill_id uuid, amount numeric);
    set test.admin = 'true';
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/202608310001_portal_bill_read_rounds.sql', import.meta.url), 'utf8'))
  for (let n = 1; n <= 5; n++) {
    await db.query('insert into tenants values ($1,$2,null)', [id(200 + n), n === 3 ? null : `U${n}`])
    await db.query('insert into rooms values ($1)', [id(100 + n)])
    await db.query('insert into contracts values ($1,null)', [id(300 + n)])
    await db.query('insert into bills values ($1,$2,$3,$4,$5,$6,2500)', [id(400 + n), id(200 + n), id(100 + n), id(300 + n), month, n === 4 ? 'paid' : 'pending'])
  }
  await db.query('insert into payments values ($1,2500)', [id(405)])
  await db.exec('set role authenticated')
  await prepare()
  check(await scalar('select count(*)::int from portal_bill_deliveries'), 2) // excludes no LINE, paid, fully paid
  check((await finish([sent(1)])).completed, false)
  await prepare(month, false)
  check(await scalar('select count(*)::int from portal_bill_deliveries where sent_at is not null'), 1)
  // An opening DURING the successful request must count, not be wiped on completion.
  await db.exec('reset role')
  await db.query('update portal_bill_deliveries set last_open_at=$1 where bill_id=$2', ['2026-08-31T09:00:02Z', id(402)])
  await db.exec('set role authenticated')
  check(await finish([sent(2)]), { completed: true, activated: true, pending: 0 })
  check(await scalar('select last_open_at >= first_sent_started_at from portal_bill_deliveries where bill_id=$1', [id(402)]), true)
  const cutoff = await scalar('select first_sent_started_at::text from portal_bill_deliveries where bill_id=$1', [id(402)])
  const completed = await scalar('select completed_at::text from portal_bill_rounds where billing_month=$1', [month])
  await prepare()
  check((await finish([sent(2, '2026-09-01T09:00:00Z')])).activated, false)
  check(await scalar('select first_sent_started_at::text from portal_bill_deliveries where bill_id=$1', [id(402)]), cutoff)
  check(await scalar('select completed_at::text from portal_bill_rounds where billing_month=$1', [month]), completed)
  // Old month completion must not replace latest month in the tenants UI query.
  await prepare('2026-07-01')
  check((await finish([], '2026-07-01')).completed, false)
  check(await scalar('select billing_month::text from portal_bill_rounds where completed_at is not null order by billing_month desc limit 1'), month)
  await assert.rejects(prepare('2026-09-01', false), /start the full bulk send/); checks++
  await assert.rejects(prepare('2026-08-15'), /invalid billing month/); checks++
  await db.exec("set test.admin = 'false'")
  await assert.rejects(prepare(), /forbidden/); checks++
  check(await scalar('select count(*)::int from portal_bill_rounds'), 0) // RLS
  await assert.rejects(db.query('select record_portal_bill_open($1,$2,$3)', ['U1', id(201), id(101)]), /permission denied/); checks++
  await db.exec('reset role; set role anon')
  await assert.rejects(prepare(), /permission denied/); checks++
  await assert.rejects(db.query('select * from portal_bill_deliveries'), /permission denied/); checks++
  // Service-role tracking is scoped to verified recipient + tenant + displayed room.
  await db.exec('reset role; set role service_role')
  await db.query('select record_portal_bill_open($1,$2,$3)', ['wrong-recipient', id(201), id(101)])
  check(await scalar('select last_open_at from portal_bill_deliveries where bill_id=$1', [id(401)]), null)
  await db.query('select record_portal_bill_open($1,$2,$3)', ['U1', id(201), id(102)])
  check(await scalar('select last_open_at from portal_bill_deliveries where bill_id=$1', [id(401)]), null)
  await db.query('select record_portal_bill_open($1,$2,$3)', ['U1', id(201), id(101)])
  // Service role does not bypass RLS in this minimal fixture; inspect as owner.
  await db.exec('reset role')
  check(await scalar('select last_open_at is not null from portal_bill_deliveries where bill_id=$1', [id(401)]), true)
  console.log(`Portal bill round SQL: ${checks} checks passed (isolated PostgreSQL)`)
} finally {
  await db.close()
}
