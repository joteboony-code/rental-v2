'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  RefreshCw,
  MessagesSquare,
  Users,
  ChevronRight,
  FileText,
} from 'lucide-react'
import {
  Card, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface TransferCase {
  id: string
  icon: React.ReactNode
  title: string
  tagline: string
  description: string
  effect: string[]
  caution: string
  /** destination(s) this case leads to */
  href: string | null
  externalHref?: string | null
  cta: string
  disabled?: boolean
  disabledReason?: string
}

interface TransferWizardProps {
  tenantId: string
  contractId: string | null
  roomNumber: string | null
  hasLine: boolean
}

export function TransferWizard({
  tenantId,
  contractId,
  roomNumber,
  hasLine,
}: TransferWizardProps) {
  const [openCase, setOpenCase] = useState<TransferCase | null>(null)

  const checkoutUrl = contractId
    ? `/tenants/${tenantId}/checkout?contractId=${contractId}`
    : null

  const cases: TransferCase[] = [
    {
      id: 'replace',
      icon: <RefreshCw className="size-5" />,
      title: 'เปลี่ยนผู้เช่าใหม่',
      tagline: 'ผู้เช่าเดิมย้ายออก ญาติ/คนใหม่เข้าห้องเดิม (เริ่มสัญญาใหม่)',
      description:
        'ใช้เมื่อ คนเดิมจะออกไปจริง ๆ และให้คนใหม่เช่าห้องนี้ต่อ โดยเริ่มต้นสัญญา / ประวัติมิเตอร์ / บิล ใหม่หมด',
      effect: [
        'ปลดผู้เช่าเดิมผ่านการ "ย้ายออก" (จัดการเงินมัดจำ / บิลค้างในขั้นนั้น)',
        'ห้องจะกลับเป็น "ว่าง"',
        'จากนั้นให้คนใหม่สแกน QR ลงทะเบียน → ระบบสร้างสัญญาใหม่ชื่อคนใหม่',
      ],
      caution:
        'เงินมัดจำ / บิลค้าง จะไม่โอนอัตโนมัติ ต้องจัดการตอน "ย้ายออก" (หักมัดจำ, เคลียร์บิล) ก่อน หรือตกลงกันนอกระบบ',
      href: checkoutUrl,
      externalHref: roomNumber ? `/rooms?focus=${roomNumber}` : '/rooms',
      cta: 'ไปขั้นตอน "ย้ายออก"',
    },
    {
      id: 'line_bill',
      icon: <MessagesSquare className="size-5" />,
      title: 'ให้ญาติรับบิล / ดูแลแทน',
      tagline: 'สัญญายังชื่อเดิม แต่เปลี่ยนคนรับ LINE / ใบแจ้งชำระ',
      description:
        'ใช้เมื่อ ผู้เช่าเดิมยังรับผิดชอบอยู่ แต่ต้องการให้ญาติรับใบแจ้งค่าเช่า / แจ้งซ่อม / สแกนจ่าย แทน (เฉพาะห้องนี้)',
      effect: [
        'ไม่แตะสัญญา / ผู้เช่า / มิเตอร์ / บิล',
        'แค่เปลี่ยน "ผู้รับบิลเฉพาะห้องนี้" ให้เป็น LINE ของญาติ',
        'สามารถสลับกลับไปหาคนเดิมได้ตลอด',
      ],
      caution: 'ผู้เช่าเดิมยังเป็นเจ้าของสัญญาและจ่ายเงินอยู่ ญาติแค่ "รับใบแจ้ง" เท่านั้น',
      href: hasLine ? `/tenants/${tenantId}` : `/tenants/${tenantId}`,
      externalHref: null,
      cta: 'ไปหน้าการ์ด "จับคู่ LINE"',
    },
    {
      id: 'renaming',
      icon: <FileText className="size-5" />,
      title: 'สลับคนรับ LINE ชั่วคราว',
      tagline: 'เหมือนให้ญาติรับบิล แต่แค่ช่วงนี้ (สลับไปมาได้)',
      description:
        'ใช้เมื่อ ต้องการให้อีกคนรับใบแจ้งแค่รอบนี้ แล้ววันหลังคืนให้ผู้เช่าเดิม',
      effect: [
        'เหมือนกรณี "ให้ญาติรับบิล" เป๊ะ — แค่จับคู่ LINE',
        'ทำเสร็จแล้วถ้าต้องการคืนก็จับคู่ LINE กลับคนเดิมได้',
        'ไม่กระทบสัญญา / เงิน / มิเตอร์',
      ],
      caution: 'เป็นกรณีเดียวกับ "ให้ญาติรับบิล" — แค่ใช้แบบชั่วคราว',
      href: hasLine ? `/tenants/${tenantId}` : `/tenants/${tenantId}`,
      externalHref: null,
      cta: 'ไปหน้าการ์ด "จับคู่ LINE"',
    },
    {
      id: 'second_contact',
      icon: <Users className="size-5" />,
      title: 'เพิ่มผู้ติดต่อ / ผู้รับผิดชอบร่วม',
      tagline: 'เก็บผู้เช่าเดิม + เพิ่มอีกคนเป็นผู้ติดต่อฉุกเฉิน',
      description:
        'ระบบผูก 1 ห้อง = 1 สัญญา = 1 ผู้เช่าหลัก (เพิ่ม "คนที่ 2 ในสัญญาเดียวกัน" ไม่ได้)',
      effect: [
        'วิธีที่ใช้ได้: เปลี่ยนเป็นผู้เช่าใหม่ (กรณี "เปลี่ยนผู้เช่าใหม่") แล้วจดผู้เช่าเดิมเป็น "ผู้ติดต่อฉุกเฉิน"',
        'ช่อง emergency_contact มีอยู่แล้วในแบบฟอร์มผู้เช่า',
      ],
      caution:
        'ระบบไม่รองรับ "2 คนในสัญญาเดียว" โดยตรง ต้องใช้กรณี "เปลี่ยนผู้เช่าใหม่" + จดเป็นผู้ติดต่อฉุกเฉินแทน',
      href: `/tenants/${tenantId}/edit`,
      externalHref: null,
      cta: 'ไปหน้า "แก้ไขผู้เช่า" (ใส่ผู้ติดต่อฉุกเฉิน)',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cases.map((c) => (
          <Card key={c.id} size="sm" className={cn(
            'transition-shadow',
            c.disabled ? 'opacity-70' : 'hover:shadow-md cursor-pointer',
          )}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setOpenCase(c)}
              disabled={c.disabled}
            >
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      {c.icon}
                    </span>
                    <CardTitle>{c.title}</CardTitle>
                  </div>
                  <ChevronRight className="size-4 text-slate-300" />
                </div>
                <CardDescription className="pt-1">{c.tagline}</CardDescription>
              </CardHeader>
            </button>
          </Card>
        ))}
      </div>

      {/* Popup: explain the case then route to existing flow */}
      <Dialog open={!!openCase} onOpenChange={(o) => { if (!o) setOpenCase(null) }}>
        {openCase && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>{openCase.icon}</span>
                {openCase.title}
              </DialogTitle>
              <DialogDescription>{openCase.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ผลที่จะเกิดขึ้น</p>
              <ul className="space-y-1.5">
                {openCase.effect.map((e, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="text-emerald-500 mt-0.5">✓</span> {e}
                  </li>
                ))}
              </ul>

              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-800 mb-0.5">ข้อควรระวัง</p>
                <p className="text-xs text-amber-700 leading-relaxed">{openCase.caution}</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCase(null)}>ปิด</Button>
              {openCase.href ? (
                <Link
                  href={openCase.href}
                  target={openCase.externalHref ? '_blank' : undefined}
                  className={buttonVariants({ size: 'sm' }) + ' rounded-xl gap-1.5'}
                >
                  {openCase.cta}
                  <ChevronRight className="size-3.5" />
                </Link>
              ) : (
                <Button size="sm" disabled>{openCase.cta}</Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <p className="text-xs text-slate-400">
        ระบบนำไปใช้ flow เดิมที่รองรับอยู่แล้ว (ย้ายออก / จับคู่ LINE / แก้ไขผู้เช่า) — ไม่แก้ข้อมูลตรง ๆ ปลอดภัย
      </p>
    </div>
  )
}
