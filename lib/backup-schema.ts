// Ephemeral pairing tokens and rate-limit counters are deliberately not restored.
export const BACKUP_TABLES = [
  'profiles', 'settings', 'rooms', 'tenants', 'contracts', 'meter_readings',
  'bills', 'payments', 'repair_requests', 'leads', 'expenses', 'broadcast_history',
  'audit_logs', 'line_message_templates', 'dorms', 'line_integrations',
  'payment_promises', 'pending_slips', 'tenant_registration_requests',
  'tenant_documents', 'tenant_credits', 'meter_baseline_adjustments',
  'portal_bill_rounds', 'portal_bill_deliveries', 'page_views',
] as const

// Older installations may have this retired analytics table. Current view
// counts live in settings.interest_view_count, which remains mandatory.
export const OPTIONAL_BACKUP_TABLES: ReadonlySet<string> = new Set(['page_views'])

export type BackupData = { version: 1; exportedAt: string; tables: Record<string, Record<string, unknown>[]> }

export function validateBackupData(value: unknown): BackupData {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('tables' in value) || !value.tables || typeof value.tables !== 'object'
      || !('exportedAt' in value) || typeof value.exportedAt !== 'string') {
    throw new Error('Invalid database backup')
  }
  const allowed: ReadonlySet<string> = new Set(BACKUP_TABLES)
  for (const [name, rows] of Object.entries(value.tables)) {
    if (!allowed.has(name) || !Array.isArray(rows)
      || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`Invalid backup table: ${name}`)
    }
  }
  if (Object.keys(value.tables).length === 0) throw new Error('Empty backup')
  return value as BackupData
}

// Offline recovery: refuses non-empty targets and retains FK/check constraints.
// Use the same schema/migrations and restore auth.users separately beforehand.
export function createRestoreSql(input: unknown): string {
  const bundle = validateBackupData(input)
  const literal = JSON.stringify(bundle.tables).replace(/'/g, "''")
  let tag = '$rental_restore$'
  while (literal.includes(tag)) tag = tag.slice(0, -1) + '_$'
  return `begin;
set local standard_conforming_strings = on;
do ${tag}
declare
  data jsonb := '${literal}'::jsonb;
  pending text[] := array(select jsonb_object_keys(data));
  name text; cols text; count_rows bigint; progressed boolean; col record; seq text;
begin
  -- Validate ALL targets before the first insert; never truncate live data.
  foreach name in array pending loop
    if to_regclass(format('public.%I',name)) is null then raise exception 'Missing target table %',name; end if;
    execute format('select count(*) from public.%I',name) into count_rows;
    if count_rows <> 0 then raise exception 'Restore requires empty target table %',name; end if;
  end loop;
  while cardinality(pending)>0 loop
    progressed:=false;
    foreach name in array pending loop
      if exists(select 1 from pg_constraint c join pg_class parent on parent.oid=c.confrelid
        where c.contype='f' and c.conrelid=to_regclass(format('public.%I',name))
        and c.confrelid<>c.conrelid and parent.relname=any(pending)) then continue; end if;
      select string_agg(format('%I',attname),',' order by attnum) into cols from pg_attribute
        where attrelid=to_regclass(format('public.%I',name)) and attnum>0 and not attisdropped and attgenerated='';
      execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I,$1)',name,cols,cols,name) using data->name;
      execute format('select count(*) from public.%I',name) into count_rows;
      if count_rows<>jsonb_array_length(data->name) then raise exception 'Row count mismatch %',name; end if;
      for col in select attname from pg_attribute where attrelid=to_regclass(format('public.%I',name)) and attnum>0 and not attisdropped loop
        seq:=pg_get_serial_sequence(format('public.%I',name),col.attname);
        if seq is not null then
          execute format('select setval(%L,greatest(coalesce(max(%I),0),1),coalesce(max(%I),0)>0) from public.%I',seq,col.attname,col.attname,name);
        end if;
      end loop;
      pending:=array_remove(pending,name);
      progressed:=true;
    end loop;
    if not progressed then raise exception 'Cyclic foreign keys require an explicit restore plan'; end if;
  end loop;
end;
${tag};
commit;
`
}
