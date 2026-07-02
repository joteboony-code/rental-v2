import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getBackupBucket, runBackup } from '@/lib/backup'
import {
  completedMonthMarkerKey,
  evaluateBillingCompletion,
  type CompletionBill,
} from '@/lib/backup-completion'

function isAuthorized(req: NextRequest) {
  const supplied = req.headers.get('x-cron-secret')
  const allowed = [
    process.env.CRON_SECRET,
    process.env.BACKUP_TRIGGER_SECRET,
  ].filter(Boolean)
  return !!supplied && allowed.includes(supplied)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const [{ data: settings, error: settingsError }, { data: rooms, error: roomsError }] =
      await Promise.all([
        supabase
          .from('settings')
          .select('current_billing_month')
          .eq('id', 1)
          .single(),
        supabase.from('rooms').select('id').eq('status', 'occupied'),
      ])
    if (settingsError) throw new Error(`Settings: ${settingsError.message}`)
    if (roomsError) throw new Error(`Rooms: ${roomsError.message}`)

    const billingMonth = settings?.current_billing_month as string | null
    if (!billingMonth) {
      return NextResponse.json({ ok: true, backedUp: false, reason: 'missing_billing_month' })
    }

    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('room_id, status, total_amount, payments(amount)')
      .eq('billing_month', billingMonth)
    if (billsError) throw new Error(`Bills: ${billsError.message}`)

    const completion = evaluateBillingCompletion(
      (rooms ?? []).map((room) => room.id as string),
      (bills ?? []) as unknown as CompletionBill[]
    )
    if (!completion.complete) {
      return NextResponse.json({ ok: true, backedUp: false, ...completion })
    }

    const bucket = await getBackupBucket()
    const markerKey = completedMonthMarkerKey(billingMonth)
    const existing = await bucket.get(markerKey)
    if (existing) {
      return NextResponse.json({
        ok: true,
        backedUp: false,
        reason: 'already_backed_up',
        billingMonth: billingMonth.slice(0, 7),
      })
    }

    const summary = await runBackup(bucket)
    await bucket.put(markerKey, JSON.stringify({
      version: 1,
      billingMonth: billingMonth.slice(0, 7),
      snapshotId: summary.id,
      completedAt: summary.completedAt,
    }), {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store',
      },
    })

    return NextResponse.json({
      ok: true,
      backedUp: true,
      billingMonth: billingMonth.slice(0, 7),
      id: summary.id,
      rows: summary.totalRows,
      files: summary.totalFiles,
      encryptedBytes: summary.encryptedBytes,
    })
  } catch (error) {
    console.error('[backup] scheduled backup failed', error)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}
