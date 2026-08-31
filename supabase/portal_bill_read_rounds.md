# Portal read rounds

Apply `migrations/202608310001_portal_bill_read_rounds.sql` before deploying the accompanying application changes. The migration is additive and does not clear existing tenant portal timestamps, bills, or payments.

Only the **แจ้งทุกห้องผ่าน LINE** button on `/bills`, after selecting text/Flex and actually sending, prepares a round. Opening its menu, single-bill sends, overdue reminders, and calendar changes do not start/reset rounds.

- The snapshot covers payable bills with a LINE recipient for the selected billing month; paid/no-LINE rooms are excluded.
- A round activates after all eligible snapshot recipients have successful deliveries. Failed sends can be retried without discarding prior successes.
- Read status uses the first successful send's start time per bill, preserving portal opens that happen while a batch is sending.
- Sending the same month again cannot advance that cutoff or reset a completed round. The latest completed **billing month**, not the latest send timestamp, is displayed.
- Opening another room or using owner preview does not count as that room's tenant opening.
- Before any completed round exists, legacy badges remain. Excluded tenants show `ไม่ได้ส่งบิลรอบนี้` once a round exists.
- If preparation fails, no LINE is sent. If recording the result fails after LINE delivery, the UI distinguishes delivery success from tracking failure; inspect send history before repeating messages.

Verification:

```powershell
npm test
npm run lint
npm run build

# Optional isolated SQL execution; installs only to a temporary directory.
npm install --prefix "$env:TEMP/rental-portal-sql-verification" --no-audit --no-fund --package-lock=false @electric-sql/pglite@0.5.8
$env:PGLITE_MODULE_PATH = "$env:TEMP/rental-portal-sql-verification/node_modules/@electric-sql/pglite/dist/index.js"
node scripts/test-portal-bill-rounds.mjs
```

The SQL test uses a disposable in-memory PostgreSQL fixture. It does not connect to Supabase or send LINE messages.
