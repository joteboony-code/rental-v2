-- Add toggle for 9 AM overdue bill LINE notification
ALTER TABLE line_integrations
  ADD COLUMN IF NOT EXISTS bill_reminder_notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;
