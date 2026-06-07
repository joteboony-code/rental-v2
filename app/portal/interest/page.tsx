import { InterestForm } from './_components/interest-form'

export default function InterestPage() {
  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="bg-[#0C1B4D] px-5 pt-14 pb-8">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">ห้องพัก</p>
          <h1 className="text-2xl font-bold text-white">ฝากชื่อสนใจเช่าห้อง</h1>
          <p className="text-sm text-slate-300 mt-1">กรอกข้อมูลไว้ เจ้าของหอจะติดต่อกลับเมื่อมีห้องว่าง</p>
        </div>
      </div>
      <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
        <InterestForm />
      </div>
    </main>
  )
}
