'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type DataPoint = { month: string; water: number; electricity: number }

export function UsageChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit=" หน่วย" width={68} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          formatter={(val, name) => [
            `${val ?? 0} หน่วย`,
            name === 'water' ? 'น้ำ' : 'ไฟ',
          ]}
        />
        <Legend
          formatter={(val) => val === 'water' ? 'น้ำ' : 'ไฟ'}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="water"       fill="#60a5fa" radius={[4, 4, 0, 0]} name="water" />
        <Bar dataKey="electricity" fill="#fbbf24" radius={[4, 4, 0, 0]} name="electricity" />
      </BarChart>
    </ResponsiveContainer>
  )
}
