ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS owner_notify_channel TEXT NOT NULL DEFAULT 'line'
    CHECK (owner_notify_channel IN ('line', 'telegram', 'both'));
