# Scheduled reminder rollout

1. Run `supabase/migrations/202609090001_reminder_deliveries.sql` in the production SQL editor before deploying. It creates an admin-readable/service-writable delivery ledger and enables the explicitly requested owner summary toggles. It does not alter bills/payments or the 10,20,25 schedule.
2. Deploy the application only after verifying the table and toggles. The new route fails closed if its table is absent.
3. Read-only preview: `node --env-file=.env.local scripts/preview-reminders.mjs 2026-09-10`. No message is sent or audit lock created. This is a projection using current payments, recipients and promises, not a snapshot of tomorrow.
4. Open Bills → ผลแจ้งเตือน. The first run creates per-recipient records; earlier aggregate logs are not retroactively converted into delivery receipts.
5. After the scheduled 09:00 Bangkok run, inspect the ledger and owner summary. `accepted` means LINE accepted the API request, NOT device delivery or reading.

## Replay rules

- One unique row per Bangkok date/effective recipient. Dedicated contract recipients take precedence over tenant LINE IDs.
- `accepted`, `sending`, `unknown`, and `skipped` cannot be reclaimed. A crash after claiming can therefore require human review; it does not silently resend.
- Only explicit HTTP rejection codes (400,401,403,404,413,422,429) become `failed`. After fixing the underlying cause, the authenticated admin can use “ลองรอบวันนี้อีกครั้ง” on a configured reminder day. The route re-evaluates current payments and sends new/unattempted or explicitly rejected recipients only.
- No background automatic retry schedule was added. Do not delete ledger rows to retry uncertain requests. Check provider logs and tenant conversation first.
- A fresh recipient after a recipient change is a different key. Manual sends from other buttons are outside this scheduled ledger.
- Historical pre-v2 daily locks remain respected so deployment cannot resend an earlier same-day legacy run.
- Owner summaries are also claimed once per day; an ambiguous summary requires review instead of blind replay.
- Do not call the cron route as a diagnostic: it sends real messages. Use the read-only preview script.

## Remaining operational limits

The runner needs R2 for initial status recording. Billing query failures, missing ledger and status-write failures fail closed and surface to cron health reporting. The daily schedule is not a guarantee of delivery; check the ledger after each run. The history page shows up to 500 latest rows. Large datasets at query limits fail closed instead of sending an incomplete selection. No production tenant send was used for development verification.
