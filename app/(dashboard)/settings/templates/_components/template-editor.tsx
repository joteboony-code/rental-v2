'use client'

import { useState, useTransition } from 'react'
import { updateTemplate, type MessageTemplate } from '@/app/actions/templates'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Check } from 'lucide-react'

export function TemplateEditor({ template }: { template: MessageTemplate }) {
  const [isPending, startTransition] = useTransition()
  const [body, setBody] = useState(template.body)
  const [enabled, setEnabled] = useState(template.enabled)
  const [saved, setSaved] = useState(false)

  const dirty = body !== template.body || enabled !== template.enabled

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const res = await updateTemplate(template.id, body, enabled)
      if (res.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{template.title}</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-emerald-600" />
          <span className="text-xs text-slate-500">{enabled ? 'เปิดใช้' : 'ปิด (ใช้ค่าเริ่มต้น)'}</span>
        </label>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(8, body.split('\n').length + 1)}
        className="font-mono text-xs"
      />

      <div className="flex items-center justify-between">
        <code className="text-[10px] text-slate-400">{template.template_key}</code>
        <Button type="button" size="sm" onClick={handleSave} disabled={isPending || !dirty}>
          {isPending ? <><Loader2 className="size-3.5 animate-spin mr-1" />บันทึก...</>
            : saved ? <><Check className="size-3.5 mr-1" />บันทึกแล้ว</>
            : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}
