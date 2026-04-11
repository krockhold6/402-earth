-- x402 v3: resource catalog + payment attempts + event log (D1 source of truth)

CREATE TABLE resource_definitions (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDC',
  network TEXT NOT NULL DEFAULT 'base',
  active INTEGER NOT NULL DEFAULT 1,
  unlock_type TEXT NOT NULL DEFAULT 'json',
  content_type TEXT,
  success_redirect_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  status TEXT NOT NULL,
  client_type TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'x402',
  payer_address TEXT,
  payment_signature_hash TEXT,
  tx_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  expires_at TEXT
);

CREATE INDEX idx_payment_attempts_slug ON payment_attempts (slug);

CREATE INDEX idx_payment_attempts_status ON payment_attempts (status);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_payment_events_attempt_id ON payment_events (attempt_id);
