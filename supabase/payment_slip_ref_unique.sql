-- Prevent the same bill from being paid twice with the same slip reference.
-- A single slip may cover multiple bills (p_bills array in apply_multi_bill_payment),
-- so uniqueness is per (slip_ref, bill_id), not per slip_ref alone.
-- Run this in the Supabase SQL editor.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_slip_ref_bill
  ON public.payments (slip_ref, bill_id)
  WHERE slip_ref IS NOT NULL;
