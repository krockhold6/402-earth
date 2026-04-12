-- One on-chain USDC payment (tx) must not mark more than one attempt as paid.
CREATE UNIQUE INDEX idx_payment_attempts_paid_tx_hash
ON payment_attempts (tx_hash)
WHERE status = 'paid'
  AND tx_hash IS NOT NULL
  AND tx_hash != '';
