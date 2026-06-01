-- line_message_templates: ให้เจ้าของแก้ข้อความ LINE เองได้
create table if not exists line_message_templates (
  id          uuid primary key default gen_random_uuid(),
  template_key text unique not null,
  title       text not null,
  body        text not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- seed default templates (ไม่เขียนทับถ้ามีอยู่แล้ว)
insert into line_message_templates (template_key, title, body) values
  ('bill_notify',      'แจ้งค่าเช่า',            E'🔔 แจ้งค่าเช่าห้อง {room_number}\nรอบบิล {billing_month}\nยอดรวม {total_amount} บาท\nครบกำหนด {due_date}'),
  ('reminder',         'เตือนค้างชำระ',          E'🚨 แจ้งเตือนค่าเช่าค้างชำระ\nห้อง {room_number} · {tenant_name}\nยอดค้าง {remaining_amount} บาท\nครบกำหนด {due_date}'),
  ('payment_full',     'รับชำระครบแล้ว',         E'✅ รับชำระแล้วครับ\nห้อง {room_number}\nรอบบิล {billing_month}\nชำระแล้ว {paid_amount} บาท\nคงเหลือ 0 บาท'),
  ('payment_partial',  'รับชำระบางส่วน',         E'💳 รับชำระบางส่วนแล้วครับ\nห้อง {room_number}\nรอบบิล {billing_month}\nชำระแล้ว {paid_amount} บาท\nยังค้าง {remaining_amount} บาท'),
  ('slip_failed',      'สลิปตรวจไม่ผ่าน',        E'⚠️ สลิปตรวจไม่ผ่านครับ\nกรุณาส่งสลิปที่ชัดเจนอีกครั้ง หรือติดต่อเจ้าของหอ'),
  ('slip_received',    'ได้รับสลิปแล้ว',         E'📨 ได้รับสลิปแล้วครับ\n\nเจ้าของหอจะตรวจสอบและยืนยันให้นะครับ 😊'),
  ('repair_received',  'แจ้งซ่อมรับเรื่องแล้ว',  E'🔧 รับเรื่องแจ้งซ่อมแล้วครับ\nทีมงานจะติดต่อกลับโดยเร็วครับ'),
  ('promise_reminder', 'เตือนตามนัดจ่าย',        E'🤝 ใกล้ถึงวันนัดจ่ายแล้วนะครับ\nห้อง {room_number}\nนัดจ่ายวันที่ {promise_date}\nยอด {remaining_amount} บาท')
on conflict (template_key) do nothing;
