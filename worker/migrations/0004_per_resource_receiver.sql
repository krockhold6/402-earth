-- Per-resource receiver wallets (Lane 1). Existing rows get a placeholder; new resources must supply a real address via API.

ALTER TABLE resource_definitions ADD COLUMN receiver_address TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';

ALTER TABLE payment_attempts ADD COLUMN receiver_address TEXT NOT NULL DEFAULT '0x0000000000000000000000000000000000000000';

UPDATE payment_attempts
SET receiver_address = COALESCE(
  (SELECT rd.receiver_address FROM resource_definitions rd WHERE rd.slug = payment_attempts.slug),
  receiver_address
);

CREATE INDEX idx_payment_attempts_receiver_address ON payment_attempts (receiver_address);
