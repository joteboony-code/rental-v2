ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS owner_notify_channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (owner_notify_channel IN ('line', 'telegram', 'both'));
