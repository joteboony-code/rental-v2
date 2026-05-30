-- เพิ่มคอลัมน์ SlipOK ในตาราง settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS slipok_branch_id text,
  ADD COLUMN IF NOT EXISTS slipok_api_key text;
