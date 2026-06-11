'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type UtilityMonthlyPoint = {
  month: string
  waterAmount: number
  electricityAmount: number
  waterUnits: number
  electricityUnits: number
}

const money = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
const units = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 1 })

export function UtilityMonthlyChart({ data }: { data: UtilityMonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value) => `${money(Number(value))}`} width={64} />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          formatter={(value, name, item) => {
            const payload = item.payload as UtilityMonthlyPoint
            if (name === 'waterAmount') {
              return [`${money(Number(value))} บาท (${units(payload.waterUnits)} หน่วย)`, 'ค่าน้ำ']
            }
            return [`${money(Number(value))} บาท (${units(payload.electricityUnits)} หน่วย)`, 'ค่าไฟ']
          }}
        />
        <Legend
          formatter={(value) => value === 'waterAmount' ? 'ค่าน้ำ' : 'ค่าไฟ'}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="waterAmount" fill="#38bdf8" radius={[4, 4, 0, 0]} name="waterAmount" />
        <Bar dataKey="electricityAmount" fill="#f59e0b" radius={[4, 4, 0, 0]} name="electricityAmount" />
      </BarChart>
    </ResponsiveContainer>
  )
}
