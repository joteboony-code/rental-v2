// Read only. Run: node --env-file=.env.local scripts/preview-reminders.mjs YYYY-MM-DD
// Never sends messages, creates locks, or modifies bills.
import { createClient } from '@supabase/supabase-js'
const date = process.argv[2]
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Expected YYYY-MM-DD')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const results = await Promise.all([
  db.from('settings').select('reminder_enabled,reminder_days').eq('id',1).single(),
  db.from('bills').select('id,total_amount,snooze_until,billing_month,tenant_id,rooms(room_number),tenants(line_user_id),contracts(line_recipient_user_id),payments(amount)').in('status',['pending','overdue']).order('billing_month').limit(2000),
  db.from('payment_promises').select('bill_id').eq('status','active').gte('promise_date',date).limit(500),
])
for(const result of results) if(result.error) throw new Error(result.error.message)
const [settings,bills,promises] = results.map(r=>r.data)
if(bills.length >= 2000 || promises.length >= 500) throw new Error('Truncated preview; manual review required')
console.log(JSON.stringify({date,enabled:settings.reminder_enabled,days:settings.reminder_days}))
const promised = new Set(promises.map(p=>p.bill_id))
const groups = new Map()
for(const b of bills) {
  const recipient = b.contracts?.line_recipient_user_id ?? b.tenants?.line_user_id ?? null
  const key = recipient ?? `tenant:${b.tenant_id}`
  if(!groups.has(key)) groups.set(key,[])
  const amount = Math.max(0,Number(b.total_amount)-b.payments.reduce((sum,p)=>sum+Number(p.amount),0))
  const reason = !recipient ? 'no_line' : promised.has(b.id) ? 'promise' : b.snooze_until && b.snooze_until >= date ? 'snoozed' : amount < 1 ? 'paid' : 'eligible'
  groups.get(key).push({room:b.rooms?.room_number,month:b.billing_month,amount,reason})
}
let eligibleRecipients=0
for(const rows of groups.values()) { if(rows.some(r=>r.reason==='eligible')) eligibleRecipients++; console.log(JSON.stringify(rows)) }
console.log(JSON.stringify({eligibleRecipients,readOnly:true,note:'Current data projection; payments and recipients may change before the scheduled run'}))
