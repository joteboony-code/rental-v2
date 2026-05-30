const statusConfig = {
  available:   { label: '● ว่าง',      className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  occupied:    { label: '● มีผู้เช่า',  className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  maintenance: { label: '● ซ่อมบำรุง', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  reserved:    { label: '● จอง',       className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
}

export function RoomStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] ?? {
    label: status,
    className: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${config.className}`}>
      {config.label}
    </span>
  )
}
