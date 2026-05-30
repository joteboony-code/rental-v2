-- Run this in Supabase SQL Editor
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS line_channel_access_token text,
  ADD COLUMN IF NOT EXISTS line_liff_id              text,
  ADD COLUMN IF NOT EXISTS app_url                   text;
