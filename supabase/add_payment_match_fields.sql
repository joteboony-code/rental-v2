-- payments: link all payments created from the same slip/action
alter table payments add column if not exists payment_group_id uuid;
create index if not exists idx_payments_payment_group_id
  on payments(payment_group_id) where payment_group_id is not null;

-- pending_slips: record the auto-match rule that was applied (or attempted)
-- values: unique_single_bill | total_all_outstanding | single_room_total |
--         unique_single_overpay | total_all_overpay | single_room_overpay |
--         ambiguous | overpaid | no_match | manual_review
alter table pending_slips add column if not exists match_rule text;
