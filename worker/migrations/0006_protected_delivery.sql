-- Protected link delivery: seller-configurable mode + short-lived unlock tokens.

ALTER TABLE resource_definitions ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'direct';

ALTER TABLE resource_definitions ADD COLUMN protected_ttl_seconds INTEGER NULL;

ALTER TABLE resource_definitions ADD COLUMN one_time_unlock INTEGER NOT NULL DEFAULT 0;

CREATE TABLE unlock_tokens (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  attempt_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_unlock_tokens_token ON unlock_tokens (token);

CREATE INDEX idx_unlock_tokens_attempt_id ON unlock_tokens (attempt_id);
