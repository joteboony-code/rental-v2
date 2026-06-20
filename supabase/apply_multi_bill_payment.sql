-- Atomic multi-bill payment from a single slip (used by LINE webhook).
-- Inserts all payment rows and updates bill statuses in one transaction.
-- slip_ref is recorded only on the first payment row; remaining rows use
-- payment_group_id for grouping so duplicate-ref checks stay reliable.
CREATE OR REPLACE FUNCTION apply_multi_bill_payment(
  p_bills     jsonb,        -- [{id: uuid-string, amount: numeric}]
  p_method    text,
  p_slip_url  text,
  p_slip_ref  text,
  p_note      text,
  p_paid_at   timestamptz,
  p_group_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item       jsonb;
  v_bill_id    uuid;
  v_amount     numeric;
  v_payment_id uuid;
  v_bill_total numeric;
  v_total_paid numeric;
  v_due_date   date;
  v_first      boolean := true;
  v_results    jsonb   := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_bills)
  LOOP
    v_bill_id := (v_item->>'id')::uuid;
    v_amount  := (v_item->>'amount')::numeric;

    INSERT INTO payments (
      bill_id, amount, payment_method, slip_url, slip_ref,
      note, paid_at, payment_group_id
    ) VALUES (
      v_bill_id,
      v_amount,
      p_method,
      p_slip_url,
      CASE WHEN v_first THEN p_slip_ref ELSE NULL END,
      p_note,
      p_paid_at,
      p_group_id
    )
    RETURNING id INTO v_payment_id;

    v_first := false;

    SELECT total_amount, due_date
      INTO v_bill_total, v_due_date
      FROM bills WHERE id = v_bill_id;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_total_paid
      FROM payments WHERE bill_id = v_bill_id;

    UPDATE bills
       SET status = CASE
         WHEN v_total_paid >= v_bill_total THEN 'paid'
         WHEN v_due_date < CURRENT_DATE    THEN 'overdue'
         ELSE                                   'pending'
       END
     WHERE id = v_bill_id;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('payment_id', v_payment_id, 'bill_id', v_bill_id, 'amount', v_amount)
    );
  END LOOP;

  RETURN v_results;
END;
$$;
