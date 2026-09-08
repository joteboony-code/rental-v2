# Audit fixes — 7 September 2026

## Release order (important)

No production SQL is applied by the code changes or tests.

1. Take a verified backup of the existing database and storage. Keep the current encryption key outside this repository.
2. Apply these migrations to a staging copy first, then production before deploying the new app:
   - `supabase/migrations/202609040002_atomic_manual_payments.sql`
   - `supabase/migrations/202609070001_atomic_slip_payments.sql`
   - `supabase/migrations/202609070002_consistent_backup.sql`
   - `supabase/migrations/202609080001_optional_legacy_page_views_backup.sql`
3. Deploy the app (including the signed-photo URL support from the preceding audit).
4. Only AFTER signed-photo support is deployed, apply:
   - `supabase/migrations/202609040001_private_meter_repair_media.sql`
5. Test authenticated meter photos, repair photos, contract documents, tenant portal and receipt links. Anonymous direct storage URLs must fail. Do not reopen the buckets to fix an expired signed link; refresh the authorized page.
6. Run one admin backup. Confirm successful database export and storage verification under Settings → Backup. No test payment or tenant notification should be sent to real tenants.

The payment RPC signatures used by the old app remain compatible. Avoid restoring an old SQL definition of `apply_multi_bill_payment` after applying the new migrations. The oldest-first dashboard action and overpayment webhook require their new RPCs before app deployment.

## Payment guarantees

- Every application payment path locks the bill before recalculating its remaining balance.
- Multi-bill approval, the pending-slip decision and advance-credit creation either commit together or roll back together.
- LINE overpayment credits are part of the same transaction as the bill payment.
- Bank references are serialized across slip review, LINE payments and advance credits.
- Shared evidence is retained while referenced by payments, pending slips or credits.
- A notification failure cannot rewrite a bill from a stale balance.

The PostgreSQL/PGlite tests exercise actual PL/pgSQL, transaction rollback, replay rejection, authorization and restore SQL. PGlite serializes queries; these are NOT a substitute for a staging test with two independent PostgreSQL connections contending for the same bill lock.

## Backup and recovery

- Daily at 09:00 Bangkok, regardless of whether bills are fully paid.
- Application tables are exported using one STABLE RPC snapshot, including meter baseline adjustments, portal rounds/deliveries and current view counts in `settings.interest_view_count`. The retired `page_views` table is included only when it exists; every other listed table is mandatory.
- Every newly written encrypted object is read back, decrypted and compared by SHA-256 before success is recorded.
- Unchanged photos reuse immutable encrypted blobs. A snapshot's encrypted storage indexes retain its exact set of references. Never delete `rental-v2/blobs/` or apply independent expiration rules to it: older snapshots may still reference those blobs.
- `encryptedBytes` is the amount newly written for that run, not the total logical size of all referenced files. Listing/head/read operations still consume Cloudflare/Supabase operations; incremental storage is not zero-cost.
- Failed runs are retained in history. A running status older than 30 minutes is shown as failed. History pagination includes newest snapshots beyond the first 1,000 manifests.

### Offline restore preparation

Download the chosen manifest, its snapshot database and indexes, and all blob objects referenced by those indexes, preserving their R2 key paths under one local directory. Legacy snapshot-local encrypted files are also supported.

Use Node.js 24 or a compatible version with TypeScript stripping. Provide `BACKUP_ENCRYPTION_KEY` in the process environment, never as a command argument or in Git.

```powershell
node scripts/restore-backup.mjs <local-R2-root> <snapshot-id> <new-output-directory>
```

This decrypts and verifies the snapshot, recovers storage files, and creates `restore.sql` plus `verification.json`. It never connects to any database. If preparation fails, the partial output is invalid; no `verification.json` with `verified: true` should be accepted.

Restore into a NEW isolated Supabase/PostgreSQL project with the matching schema and migrations. Supply the corresponding `auth.users` identities before application rows that reference them. Import `restore.sql` only in that new target. It refuses non-empty backed-up tables, follows foreign-key dependencies, retains constraints, omits generated columns and reseeds identity/serial columns. It never truncates data. A cyclic foreign-key dependency fails closed for an explicit recovery plan.

Recreate storage buckets and policies from the repository, then upload recovered files using the original bucket/path names and MIME types from the encrypted indexes. Verify row counts, meter evidence, bill totals, tenant access and authorization before switching environments.

This is an application-data backup, not a complete Supabase project export: database schema/functions/policies come from migrations; Auth, project configuration, environment secrets, Google Vision credentials, LINE credentials and the backup encryption key need separate secure recovery arrangements. Pairing tokens/rate-limit counters are intentionally excluded. Files changed while a backup runs may represent a different instant from the database snapshot; perform a quiesced full recovery drill before relying on disaster recovery.

## Pre-deployment schema check — 8 September 2026

Read-only production checks found all nine required payment/backup RPCs, but calling the initial backup RPC reproduced `42P01: relation public.page_views does not exist`. Application reads/writes confirmed that current interest-page counts use `settings.interest_view_count`, not the retired table. The corrective `202609080001` migration skips only an absent legacy table, includes it when present, and continues to fail if any core table is missing. Regression tests cover the original failure and both schema variants. Run this corrective migration even if the previous three SQL files were already applied; it only replaces the backup function and does not alter tenant/payment data.

## Scheduled-job monitoring

- HTTP errors, `ok: false`, network/parse failures and partial reminder failures are surfaced.
- Results are written to private R2 and displayed on Settings → Backup → Automatic jobs.
- Failed runs attempt an owner-only notification through the configured channel; alert-delivery failure is shown too.
- Sends are not blindly retried after ambiguous provider timeouts, to avoid duplicate tenant messages.
- The page warns if no new cron report arrives for 36 hours. A completely disabled Worker/cron cannot alert from itself; detecting that automatically requires an independent external monitor.

## Dependency update

Next.js 16.3.4, matching ESLint config, Wrangler 4.129+ and patched transitive dependencies. The existing Windows OpenNext patch still applies. Keep the lockfile with this release. Run `npm audit`, typecheck, lint, tests and `npm run build:cf` again before release.
