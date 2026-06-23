-- =============================================================================
-- Security fixes: settings RLS, payment-slips bucket, checkout_tenant RPC
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Settings RLS — restrict to admin only (replaces auth.uid() IS NOT NULL)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "settings: อ่านได้ทุกคน" ON public.settings;

CREATE POLICY "settings: admin อ่านได้" ON public.settings
  FOR SELECT USING (public.is_admin());


-- ---------------------------------------------------------------------------
-- 2. payment-slips bucket — make private, replace public read with admin-only
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
  SET public = false
  WHERE id = 'payment-slips';

DROP POLICY IF EXISTS "slips: public read" ON storage.objects;

CREATE POLICY "slips: admin read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'payment-slips'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );


-- ---------------------------------------------------------------------------
-- 3. checkout_tenant RPC — single atomic transaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.checkout_tenant(
  p_contract_id  uuid,
  p_room_id      uuid,
  p_tenant_id    uuid,
  p_move_out_date text,
  p_note         text,
  p_bill_ids     uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_move_out_date  date;
  v_contract_status text;
  v_bill_id        uuid;
  v_total_amount   numeric(10,2);
  v_paid_sum       numeric(10,2);
  v_remaining      numeric(10,2);
  v_active_count   int;
BEGIN
  -- Parse and validate move-out date
  BEGIN
    v_move_out_date := p_move_out_date::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid move_out_date format. Expected YYYY-MM-DD.'
    );
  END;

  -- Check contract exists and is not already terminated
  SELECT status
    INTO v_contract_status
    FROM public.contracts
   WHERE id = p_contract_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Contract not found.'
    );
  END IF;

  IF v_contract_status = 'terminated' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Contract is already terminated.'
    );
  END IF;

  -- Terminate the contract
  UPDATE public.contracts
     SET status   = 'terminated',
         end_date = v_move_out_date,
         note     = CASE
                      WHEN p_note IS NOT NULL AND p_note <> ''
                      THEN p_note
                      ELSE note
                    END,
         updated_at = now()
   WHERE id = p_contract_id;

  -- Mark the room as available
  UPDATE public.rooms
     SET status     = 'available',
         updated_at = now()
   WHERE id = p_room_id;

  -- Unlink LINE if tenant has no remaining active contracts
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.contracts
   WHERE tenant_id = p_tenant_id
     AND status    = 'active';

  IF v_active_count = 0 THEN
    UPDATE public.tenants
       SET line_user_id = null,
           updated_at   = now()
     WHERE id = p_tenant_id;
  END IF;

  -- Settle each bill: insert payment for remaining balance, mark as paid
  IF p_bill_ids IS NOT NULL THEN
    FOREACH v_bill_id IN ARRAY p_bill_ids
    LOOP
      -- Lock and read the bill
      SELECT total_amount
        INTO v_total_amount
        FROM public.bills
       WHERE id          = v_bill_id
         AND tenant_id   = p_tenant_id
         AND status NOT IN ('paid', 'cancelled')
         FOR UPDATE;

      IF NOT FOUND THEN
        -- Skip bills that are already paid/cancelled or don't belong to this tenant
        CONTINUE;
      END IF;

      -- Sum existing payments for this bill
      SELECT COALESCE(SUM(amount), 0)
        INTO v_paid_sum
        FROM public.payments
       WHERE bill_id = v_bill_id;

      v_remaining := v_total_amount - v_paid_sum;

      -- Insert payment only if there is an outstanding balance
      IF v_remaining > 0 THEN
        INSERT INTO public.payments (
          id,
          bill_id,
          amount,
          payment_method,
          note,
          paid_at,
          recorded_by,
          created_at
        ) VALUES (
          gen_random_uuid(),
          v_bill_id,
          v_remaining,
          'other',
          COALESCE(NULLIF(p_note, ''), 'Settled on checkout'),
          now(),
          auth.uid(),
          now()
        );
      END IF;

      -- Mark the bill as paid
      UPDATE public.bills
         SET status     = 'paid',
             updated_at = now()
       WHERE id = v_bill_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Checkout completed successfully.'
  );

EXCEPTION WHEN OTHERS THEN
  -- Roll back everything on any unexpected error
  RAISE;
END;
$$;
