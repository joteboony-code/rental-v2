-- Unique partial indexes to prevent cron jobs from running twice on the same day (Bangkok timezone)
-- Run this in the Supabase SQL editor

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_cron_reminders_daily
  ON public.audit_logs (date(created_at AT TIME ZONE 'Asia/Bangkok'))
  WHERE action = 'cron_reminders_sent';

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_cron_daily_summary_daily
  ON public.audit_logs (date(created_at AT TIME ZONE 'Asia/Bangkok'))
  WHERE action = 'cron_daily_summary_sent';
