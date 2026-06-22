-- Add login notification toggle to line_integrations
ALTER TABLE public.line_integrations
ADD COLUMN IF NOT EXISTS login_notify_enabled boolean NOT NULL DEFAULT true;
