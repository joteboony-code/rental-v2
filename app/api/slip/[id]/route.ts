import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthedUser } from '@/lib/require-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = createServiceClient()

  const { data: payment, error } = await supabase
    .from('payments')
    .select('slip_url')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!payment?.slip_url) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parts = payment.slip_url.split('/payment-slips/')
  if (parts.length < 2) {
    return NextResponse.json({ error: 'Invalid slip URL' }, { status: 500 })
  }
  const path = parts[1]

  const { data: blob, error: downloadError } = await supabase.storage
    .from('payment-slips')
    .download(path)

  if (downloadError || !blob) {
    return NextResponse.json({ error: downloadError?.message ?? 'Download failed' }, { status: 500 })
  }

  const contentType = blob.type || 'application/octet-stream'
  const buffer = await blob.arrayBuffer()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
