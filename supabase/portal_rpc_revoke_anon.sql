-- Revoke anon access to the portal RPC.
-- The function is now called only via the service role (from server actions),
-- so anon users cannot invoke it directly through the Supabase REST API.
-- Run this in the Supabase SQL editor.

REVOKE EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(text, text) FROM authenticated;
