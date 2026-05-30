/**
 * Compute แถว (row) from room number
 * ห้อง  1-10 → แถวที่ 1
 * ห้อง 11-20 → แถวที่ 2
 * ห้อง 21-30 → แถวที่ 3
 */
export function roomRow(roomNumber: string | number): number {
  return Math.ceil((parseInt(String(roomNumber)) || 1) / 10)
}
