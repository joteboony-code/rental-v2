-- ============================================================
-- Import script: pananth-backup-2026-05-25_2248.json
-- Generated: 2026-05-28
-- Billing period: เมษายน 2569 (April 2026)
-- Rates confirmed from LINE notifications: ไฟ=8฿/unit, น้ำ=35฿/unit
-- ============================================================
-- วิธีรัน: วางใน Supabase SQL Editor แล้ว Run All
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. SETTINGS (update singleton row)
-- ──────────────────────────────────────────────────────────────
UPDATE public.settings SET
  water_unit_price       = 35,
  electricity_unit_price = 8,
  promptpay_id           = '0909799795',
  promptpay_name         = 'บุญรัตน์ ชลา'
WHERE id = 1;

-- ──────────────────────────────────────────────────────────────
-- 2. ROOMS (30 rooms: 1-20 ชั้น 1 @ ฿2500, 21-30 ชั้น 2 @ ฿3000)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.rooms (room_number, floor, monthly_rent, status)
VALUES
  ('1',  1, 2500, 'occupied'),
  ('2',  1, 2500, 'occupied'),
  ('3',  1, 2500, 'occupied'),
  ('4',  1, 2500, 'occupied'),
  ('5',  1, 2500, 'occupied'),
  ('6',  1, 2500, 'occupied'),
  ('7',  1, 2500, 'occupied'),
  ('8',  1, 2500, 'occupied'),
  ('9',  1, 2500, 'occupied'),
  ('10', 1, 2500, 'occupied'),
  ('11', 1, 2500, 'occupied'),
  ('12', 1, 2500, 'occupied'),
  ('13', 1, 2500, 'occupied'),
  ('14', 1, 2500, 'occupied'),
  ('15', 1, 2500, 'occupied'),
  ('16', 1, 2500, 'occupied'),
  ('17', 1, 2500, 'occupied'),
  ('18', 1, 2500, 'occupied'),
  ('19', 1, 2500, 'occupied'),
  ('20', 1, 2500, 'occupied'),
  ('21', 2, 3000, 'occupied'),
  ('22', 2, 3000, 'occupied'),
  ('23', 2, 3000, 'occupied'),
  ('24', 2, 3000, 'occupied'),
  ('25', 2, 3000, 'occupied'),
  ('26', 2, 3000, 'occupied'),
  ('27', 2, 3000, 'occupied'),
  ('28', 2, 3000, 'occupied'),
  ('29', 2, 3000, 'occupied'),
  ('30', 2, 3000, 'occupied')
ON CONFLICT (room_number) DO UPDATE SET
  floor        = EXCLUDED.floor,
  monthly_rent = EXCLUDED.monthly_rent,
  status       = EXCLUDED.status;

-- ──────────────────────────────────────────────────────────────
-- 3. TENANTS
-- ใช้ note = '__room_{N}' เป็น temp marker สำหรับ join กับ rooms
-- ห้อง 2 & 18 ใช้ LINE ID เดียวกัน (ครอบครัว) → ห้อง 18 ไม่ set line_user_id
-- ห้อง 19 & 20 ใช้ LINE ID เดียวกัน (ครอบครัว) → ห้อง 20 ไม่ set line_user_id
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.tenants (full_name, phone, line_user_id, note)
VALUES
  ('พัฒนียา แก้วคันโท',    NULL,           'U450c26a6bf164de63a534ac10eb3b394', '__room_1'),
  ('จุรีรัตน์ ชัยรัช',     '098-1280206',  'U32a3f1e7715a444833665d1fc826d7b1', '__room_2'),
  ('อาทิตยา ศิริ',         NULL,           'U81af77add49bb305a0a5b572323e7dd2', '__room_3'),
  ('สุถาพร นนทะชัย',       NULL,           'U84611d395fc7a46903d78a90bfb47320', '__room_4'),
  ('นุ่ม ไชยลิ้นฟ้า',      NULL,           'Ud76930d42558daa8ce24e47478a3f040', '__room_5'),
  ('จริยา ศิริ',           NULL,           'Ua573558fca9d0a1a2d87753e707a2cd4', '__room_6'),
  ('บุญรัตน์ ชลา',         '090-979-9795', 'U20decc89319c477129dc20b5ca455e37', '__room_7'),
  ('ปิยะวรรณ กวดนอก',      '081-312-5086', 'Ud800d2364b0796428015d516f106f28e', '__room_8'),
  ('รัชนี วรรณศรี',        NULL,           'Ucadf1f6fb2ce6c8f04f5a6a8eeb7e621', '__room_9'),
  ('วีรพล พิกุล',          NULL,           'U7ab0080b63c6592d25e43e62dfb9dc46', '__room_10'),
  ('วลัยลักษณ์ สังกะเพศ',  NULL,           'Ud73d49fb17e80d58188520f6c32d963c', '__room_11'),
  ('ลลิตา หนูหล่า',        NULL,           'U33356c3801962f3751fffaf89ae3f388', '__room_12'),
  ('นิลุบล มาตรสุด',       NULL,           'U908d4d35c33ebbf37190038b5bc4b806', '__room_13'),
  ('อนุสรา มาตรสุด',       NULL,           'U8e1af696b441246a17fb405a27461665', '__room_14'),
  ('ชาญชัย เมืองผู้กล้า',  '082-628-9254', 'U2752a93c2d3a9286a526b56b033ffc3c', '__room_15'),
  ('อุไร พรมคูณ',          NULL,           'U2f193887f0b7770f18b9a3217f2a9aa0', '__room_16'),
  ('พิณทอง บุตรเทศ',       NULL,           'U369497a9d1b14d44f7d7364bf22c0f5b', '__room_17'),
  ('จุรีรัตน์ ชัยรัช',     '098-1280206',  NULL,                                '__room_18'),
  ('เฟืองฟ้า สุขมหาหลวง',  NULL,           'U3461668daa3b561fa97084290a8cfa6b', '__room_19'),
  ('เฟืองฟ้า สุขมหาหลวง',  NULL,           NULL,                                '__room_20'),
  ('ชัชศรินทร์ ปัตตายะ',   NULL,           'U9362287b078c0ff2193985e9d9b3efbe', '__room_21'),
  ('สุพัตรา มูลสุข',       NULL,           'U7cd2de50a2ce5f7feda74d4041dbf02a', '__room_22'),
  ('พิชญา แก้วกาหลง',      NULL,           'U2714b12b543e14d0fa39b5649b1715c4', '__room_23'),
  ('สุวิมล สระนอก',        NULL,           'Ud58ab3bf726cdd61b42e45946fd5bcff', '__room_24'),
  ('กัญญาภัค ทาเอื้อ',     NULL,           'U5033510871087e8469df0889c3db5ad0', '__room_25'),
  ('พัดสลี เสาราช',        NULL,           'Ud17499ee66a10fbcb2c96df2ae90a6cd', '__room_26'),
  ('องุ่น เขจรภักดิ์',     NULL,           'U270018ff51e2f51c43b544333ea72a68', '__room_27'),
  ('ณัฐพล ไพรเขียว',       NULL,           'U6a75cb0e516429406ea53e622c66824a', '__room_28'),
  ('จิราภรณ์ อุ่นใจ',      NULL,           'U9ae13eca47c55b827193e0a36cdfe2a1', '__room_29'),
  ('อัญยณี ภูสถิตย์',      NULL,           'Ue325923df8d09da3512415ab266e6a9f', '__room_30');

-- ──────────────────────────────────────────────────────────────
-- 4. CONTRACTS — active, one per room
-- JOIN rooms ↔ tenants ผ่าน room_number ↔ note marker
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.contracts (tenant_id, room_id, status, start_date, end_date, monthly_rent, deposit_paid)
SELECT
  t.id,
  r.id,
  'active',
  '2026-01-01'::date,
  CASE r.room_number
    WHEN '7' THEN '2026-12-31'::date   -- สัญญาห้อง 7 สิ้นปี
    ELSE           '2030-12-31'::date
  END,
  r.monthly_rent,
  0
FROM public.tenants t
JOIN public.rooms   r ON r.room_number = regexp_replace(t.note, '__room_', '')
WHERE t.note LIKE '__room_%';

-- ──────────────────────────────────────────────────────────────
-- 5. METER READINGS — เมษายน 2569 (2026-04-01)
-- ep=electricity_prev, ec=electricity_curr
-- wp=water_prev,       wc=water_curr
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.meter_readings
  (room_id, billing_month, electricity_prev, electricity_curr, water_prev, water_curr)
SELECT
  r.id,
  '2026-04-01'::date,
  v.ep, v.ec, v.wp, v.wc
FROM public.rooms r
JOIN (VALUES
  ('1',   7932,  8003,  436,  440),
  ('2',   7995,  8074, 1456, 1467),
  ('3',   8785,  8998, 1154, 1169),
  ('4',    247,   371,  983,  994),
  ('5',   9309,  9371,  976,  981),
  ('6',   8702,  8938, 1296, 1316),
  ('7',   8108,  8175, 1318, 1325),
  ('8',   2383,  2399, 1005, 1005),
  ('9',    211,   452,  130,  142),
  ('10',  1798,  1974, 1579, 1584),
  ('11',  6811,  6892,  372,  374),
  ('12',  9891, 10118, 1100, 1114),
  ('13',  6787,  7109,  611,  628),
  ('14', 11464, 11677,  220,  236),
  ('15',  7269,  7422, 1344, 1365),
  ('16',  8771,  8909,  677,  691),
  ('17', 16514, 16575, 1063, 1064),
  ('18', 10783, 10851,  856,  864),
  ('19',  7283,  7333, 1788, 1795),
  ('20', 12181, 12296, 1546, 1564),
  ('21',  1870,  1949,  229,  236),
  ('22',  2382,  2475,  198,  205),
  ('23',  2203,  2349,  401,  416),
  ('24',  1224,  1282,  227,  236),
  ('25',  1162,  1190,  227,  231),
  ('26',   770,   795,  206,  214),
  ('27',  1716,  1830,  212,  220),
  ('28',  2490,  2707,  254,  258),
  ('29',  1788,  1909,  260,  274),
  ('30',  3122,  3235, 1241, 1252)
) AS v(rn, ep, ec, wp, wc) ON r.room_number = v.rn
ON CONFLICT (room_id, billing_month) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 6. BILLS — เมษายน 2569
-- electricity_amount = (ec-ep) × 8
-- water_amount       = (wc-wp) × 35
-- other_amount       = ค่าขยะ 50 + ค่า wifi (0 หรือ 100)
-- ห้อง 24 = pending (ยังไม่จ่าย), ห้องอื่น = paid
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.bills
  (contract_id, room_id, tenant_id, meter_reading_id,
   billing_month, due_date,
   rent_amount, electricity_amount, water_amount, other_amount, total_amount,
   status)
SELECT
  c.id,
  r.id,
  t.id,
  mr.id,
  '2026-04-01'::date,
  '2026-05-31'::date,
  r.monthly_rent,
  ((mr.electricity_curr - mr.electricity_prev) * 8)::numeric(10,2),
  ((mr.water_curr       - mr.water_prev)       * 35)::numeric(10,2),
  (50 + v.wifi)::numeric(10,2),
  (r.monthly_rent
   + (mr.electricity_curr - mr.electricity_prev) * 8
   + (mr.water_curr       - mr.water_prev)       * 35
   + 50 + v.wifi)::numeric(10,2),
  CASE WHEN v.paid THEN 'paid' ELSE 'pending' END
FROM public.rooms r
JOIN public.meter_readings mr ON mr.room_id = r.id AND mr.billing_month = '2026-04-01'
JOIN public.contracts c       ON c.room_id  = r.id AND c.status = 'active'
JOIN public.tenants   t       ON t.id       = c.tenant_id
JOIN (VALUES
  -- room_number, wifi, paid
  ('1',    0, TRUE),
  ('2',    0, TRUE),
  ('3',    0, TRUE),
  ('4',    0, TRUE),
  ('5',    0, TRUE),
  ('6',    0, TRUE),
  ('7',    0, TRUE),
  ('8',  100, TRUE),
  ('9',  100, TRUE),
  ('10', 100, TRUE),
  ('11',   0, TRUE),
  ('12',   0, TRUE),
  ('13',   0, TRUE),
  ('14', 100, TRUE),
  ('15', 100, TRUE),
  ('16',   0, TRUE),
  ('17', 100, TRUE),
  ('18',   0, TRUE),
  ('19',   0, TRUE),
  ('20',   0, TRUE),
  ('21',   0, TRUE),
  ('22',   0, TRUE),
  ('23',   0, TRUE),
  ('24',   0, FALSE),    -- ← ยังไม่ชำระ
  ('25',   0, TRUE),
  ('26', 100, TRUE),
  ('27', 100, TRUE),
  ('28',   0, TRUE),
  ('29', 100, TRUE),
  ('30',   0, TRUE)
) AS v(rn, wifi, paid) ON r.room_number = v.rn
ON CONFLICT (contract_id, billing_month) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 7. PAYMENTS — หนึ่งรายการต่อห้องที่ชำระแล้ว (โอนเงิน)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.payments (bill_id, amount, payment_method, note, paid_at)
SELECT
  b.id,
  b.total_amount,
  'transfer',
  'นำเข้าจากระบบเดิม (Pananth)',
  v.paid_at::timestamptz
FROM public.bills b
JOIN public.rooms r ON r.id = b.room_id
JOIN (VALUES
  ('1',  '2026-05-01T08:35:28Z'),
  ('2',  '2026-04-30T11:54:50Z'),
  ('3',  '2026-05-01T05:14:48Z'),
  ('4',  '2026-05-03T10:33:14Z'),
  ('5',  '2026-05-03T01:51:19Z'),
  ('6',  '2026-05-25T04:46:44Z'),
  ('7',  '2026-05-11T01:50:04Z'),
  ('8',  '2026-05-10T10:52:37Z'),
  ('9',  '2026-05-04T23:41:46Z'),
  ('10', '2026-04-30T08:51:26Z'),
  ('11', '2026-05-05T01:46:20Z'),
  ('12', '2026-05-01T03:29:50Z'),
  ('13', '2026-04-30T23:58:52Z'),
  ('14', '2026-05-01T06:54:34Z'),
  ('15', '2026-04-30T09:28:19Z'),
  ('16', '2026-05-02T23:51:27Z'),
  ('17', '2026-05-03T17:13:22Z'),
  ('18', '2026-05-04T03:43:15Z'),
  ('19', '2026-05-10T02:06:26Z'),
  ('20', '2026-05-10T02:06:52Z'),
  ('21', '2026-05-02T11:30:25Z'),
  ('22', '2026-05-01T11:04:15Z'),
  ('23', '2026-05-01T06:52:25Z'),
  -- ('24', ...) ← ห้อง 24 ยังไม่ชำระ ไม่ต้อง insert payment
  ('25', '2026-05-03T03:03:23Z'),
  ('26', '2026-04-30T12:33:03Z'),
  ('27', '2026-05-01T01:36:34Z'),
  ('28', '2026-05-05T07:26:34Z'),
  ('29', '2026-05-10T02:10:56Z'),
  ('30', '2026-05-09T15:32:54Z')
) AS v(rn, paid_at) ON r.room_number = v.rn
WHERE b.billing_month = '2026-04-01';

-- ──────────────────────────────────────────────────────────────
-- 8. CLEANUP — ลบ temp marker ออกจาก note
-- ──────────────────────────────────────────────────────────────
UPDATE public.tenants SET note = NULL WHERE note LIKE '__room_%';

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- VERIFY — รัน query เหล่านี้หลัง import เพื่อตรวจสอบ
-- ──────────────────────────────────────────────────────────────
/*
SELECT 'rooms'          AS tbl, count(*) FROM public.rooms;          -- expect 30
SELECT 'tenants'        AS tbl, count(*) FROM public.tenants;        -- expect 30
SELECT 'contracts'      AS tbl, count(*) FROM public.contracts;      -- expect 30
SELECT 'meter_readings' AS tbl, count(*) FROM public.meter_readings; -- expect 30
SELECT 'bills'          AS tbl, count(*) FROM public.bills;          -- expect 30
SELECT 'payments'       AS tbl, count(*) FROM public.payments;       -- expect 29

-- ตรวจสอบยอดรวม (ห้อง 24 ค้างจ่าย 3,829฿)
SELECT
  sum(total_amount)                                          AS total_billed,
  sum(CASE WHEN status = 'paid' THEN total_amount END)       AS total_paid,
  sum(CASE WHEN status = 'pending' THEN total_amount END)    AS total_pending
FROM public.bills
WHERE billing_month = '2026-04-01';

-- ตรวจสอบห้อง 24 (ต้อง pending)
SELECT r.room_number, b.total_amount, b.status
FROM public.bills b
JOIN public.rooms r ON r.id = b.room_id
WHERE b.billing_month = '2026-04-01' AND b.status = 'pending';
*/
