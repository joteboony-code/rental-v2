begin;
-- STABLE keeps all table reads on one MVCC snapshot (including inner SELECTs).
create or replace function public.admin_export_application_backup()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare name text; rows jsonb; data jsonb:='{}'::jsonb;
begin
  foreach name in array array[
    'profiles','settings','rooms','tenants','contracts','meter_readings','bills','payments',
    'repair_requests','leads','expenses','broadcast_history','audit_logs','line_message_templates',
    'dorms','line_integrations','payment_promises','pending_slips','tenant_registration_requests',
    'tenant_documents','tenant_credits','meter_baseline_adjustments','portal_bill_rounds','portal_bill_deliveries','page_views'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',name) into rows;
    data:=data||jsonb_build_object(name,rows);
  end loop;
  return jsonb_build_object('version',1,'exportedAt',now(),'tables',data);
end;
$$;
revoke all on function public.admin_export_application_backup() from public,anon,authenticated;
grant execute on function public.admin_export_application_backup() to service_role;
commit;
