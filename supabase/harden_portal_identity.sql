-- Portal routines accept a LINE user ID, so they must never be callable by
-- browser roles. Server Actions verify a signed portal session, then use service_role.
REVOKE ALL ON FUNCTION public.get_tenant_portal_by_line_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_portal_by_line_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_portal_by_line_user(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_portal_by_line_user(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.pair_tenant_line(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pair_tenant_line(text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pair_tenant_line(text, text, text, text) TO service_role;

-- LINE retries must be claimed atomically before a webhook is handled.
CREATE TABLE IF NOT EXISTS public.processed_line_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_line_events ENABLE ROW LEVEL SECURITY;
