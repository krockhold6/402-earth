-- Payment sessions (durable source of truth for polling + x402)
CREATE TABLE payment_sessions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  provider_ref TEXT,
  checkout_url TEXT,
  success_url TEXT NOT NULL,
  fail_url TEXT NOT NULL,
  resource_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_payment_sessions_provider_ref ON payment_sessions (provider_ref);

-- Raw webhook deliveries (audit + idempotency)
CREATE TABLE payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_ref TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE UNIQUE INDEX idx_payment_webhook_events_dedupe
  ON payment_webhook_events (provider, provider_event_id);

-- Status transition log
CREATE TABLE payment_status_transitions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES payment_sessions (id)
);

CREATE INDEX idx_payment_status_transitions_session
  ON payment_status_transitions (session_id);
