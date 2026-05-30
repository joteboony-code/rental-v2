'use client'

import { useState, useTransition } from 'react'
import { updateRepairStatus } from '@/app/actions/repairs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { RepairStatus } from '@/lib/definitions'
import { Loader2 } from 'lucide-react'

interface Props {
  repairId:       string
  currentStatus:  RepairStatus
  currentNote:    string | null
}

const nextSteps: Record<RepairStatus, { value: RepairStatus; label: string }[]> = {
  pending:     [{ value: 'in_progress', label: '▶ เริ่มดำเนินการ' }, { value: 'cancelled', label: '✕ ยกเลิก' }],
  in_progress: [{ value: 'done',        label: '✓ เสร็จแล้ว'       }, { value: 'cancelled', label: '✕ ยกเลิก' }],
  done:        [],
  cancelled:   [{ value: 'pending',     label: '↺ เปิดใหม่'        }],
}

export function StatusUpdater({ repairId, currentStatus, currentNote }: Props) {
  const [isPending, startTransition] = useTransition()
  const [note, setNote]              = useState(currentNote ?? '')
  const [result, setResult]          = useState<{ success: boolean; message: string } | null>(null)

  const actions = nextSteps[currentStatus] ?? []

  if (actions.length === 0) return null

  function handleUpdate(status: RepairStatus) {
    startTransition(async () => {
      const res = await updateRepairStatus(repairId, status, note)
      setResult(res)
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-600">บันทึก / หมายเหตุผู้ดูแล</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="วิธีแก้ไข, ข้อสังเกต..."
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {actions.map((action) => (
          <Button
            key={action.value}
            variant={action.value === 'done' ? 'default' : action.value === 'cancelled' ? 'outline' : 'outline'}
            size="sm"
            onClick={() => handleUpdate(action.value)}
            disabled={isPending}
            className={action.value === 'cancelled' ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : action.label}
          </Button>
        ))}
      </div>

      {result && (
        <p className={`text-xs ${result.success ? 'text-green-600' : 'text-red-500'}`}>
          {result.message}
        </p>
      )}
    </div>
  )
}
