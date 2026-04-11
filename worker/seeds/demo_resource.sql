-- Demo resource for Worker v3 manual tests (resource_definitions).
-- Requires migration 0002 applied on the target database.
--
-- Local:  npm run db:seed:local
-- Remote: npm run db:seed:remote

INSERT OR REPLACE INTO resource_definitions (
  slug,
  label,
  amount,
  currency,
  network,
  active,
  unlock_type,
  content_type,
  success_redirect_path,
  created_at,
  updated_at
) VALUES (
  'demo-001',
  'Test Payment',
  '5.00',
  'USDC',
  'base',
  1,
  'json',
  NULL,
  '/success/demo-001',
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
