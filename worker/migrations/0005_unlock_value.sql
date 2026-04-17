-- Paid delivery payload (stored server-side; returned only after verified x402 payment).

ALTER TABLE resource_definitions ADD COLUMN unlock_value TEXT;
