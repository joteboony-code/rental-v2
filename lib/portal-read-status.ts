export type PortalReadDelivery = {
  tenant_id: string
  room_id: string
  sent_at: string | null
  first_sent_started_at: string | null
  last_open_at: string | null
}

export function portalReadStatus(
  legacyLastOpen: string | null,
  roundMonth: string | null,
  deliveries: PortalReadDelivery[],
  available = true,
): { opened: boolean; label: string } {
  if (!available) return { opened: false, label: 'โหลดสถานะ Portal ไม่สำเร็จ' }
  if (!roundMonth) return {
    opened: !!legacyLastOpen,
    label: legacyLastOpen ? 'เปิด Portal แล้ว' : 'ยังไม่เปิด Portal',
  }
  const sent = deliveries.filter((d) => d.sent_at && d.first_sent_started_at)
  if (!sent.length) return { opened: false, label: 'ไม่ได้ส่งบิลรอบนี้' }
  const opened = sent.every((d) => d.last_open_at
    && Date.parse(d.last_open_at) >= Date.parse(d.first_sent_started_at!))
  return { opened, label: opened ? 'เปิด Portal รอบนี้แล้ว' : 'ยังไม่เปิด Portal รอบนี้' }
}
