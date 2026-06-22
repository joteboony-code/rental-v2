import Link from 'next/link'
import { Settings, MessageSquareText, ChevronRight, Zap, QrCode, MessageCircle, ShieldCheck } from 'lucide-react'

export default function SettingsPage() {
  const items = [
    {
      href: '/settings/templates',
      icon: <MessageSquareText className="size-5 text-green-600" />,
      bg: 'bg-green-100',
      title: 'ข้อความ LINE',
      desc: 'แก้ไขข้อความแจ้งเตือน รับชำระ ฯลฯ',
    },
    {
      href: '/settings/general',
      icon: <Zap className="size-5 text-amber-600" />,
      bg: 'bg-amber-100',
      title: 'ทั่วไป',
      desc: 'ค่าน้ำ ค่าไฟ รอบบิล แจ้งเตือน SlipOK',
    },
    {
      href: '/settings/payment',
      icon: <QrCode className="size-5 text-amber-600" />,
      bg: 'bg-orange-100',
      title: 'การชำระเงิน',
      desc: 'PromptPay, บัญชีธนาคาร, ลายเซ็น',
    },
    {
      href: '/settings/line',
      icon: <MessageCircle className="size-5 text-green-600" />,
      bg: 'bg-green-100',
      title: 'LINE & เอกสาร',
      desc: 'LINE Messaging API, ข้อมูลผู้ให้เช่า, สัญญา',
    },
    {
      href: '/settings/security',
      icon: <ShieldCheck className="size-5 text-indigo-600" />,
      bg: 'bg-indigo-100',
      title: 'ความปลอดภัย',
      desc: '2FA, เปลี่ยนรหัสผ่าน, ออกจากระบบทุกเครื่อง',
    },
  ] as const

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ระบบ</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight flex items-center gap-2">
          <Settings className="size-6 text-slate-400" strokeWidth={1.75} />
          ตั้งค่า
        </h1>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className={`size-9 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <ChevronRight className="size-4 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}
