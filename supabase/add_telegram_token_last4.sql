ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token_last4 TEXT;
