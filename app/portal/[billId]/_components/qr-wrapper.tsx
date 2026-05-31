'use client'

import nextDynamic from 'next/dynamic'

const PromptPayQR = nextDynamic(
  () => import('@/app/(dashboard)/bills/[id]/_components/promptpay-qr').then((m) => m.PromptPayQR),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-slate-100" /> }
)

export function QRWrapper(props: { promptpayId: string; promptpayName: string; amount: number }) {
  return <PromptPayQR {...props} />
}
