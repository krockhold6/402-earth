-- Demo resources for Worker v3 manual tests (resource_definitions).
-- Requires migrations through 0006 applied on the target database.
--
-- Local:  npm run db:seed:local
-- Remote: npm run db:seed:remote

INSERT OR REPLACE INTO resource_definitions (
  slug,
  label,
  amount,
  currency,
  network,
  receiver_address,
  active,
  unlock_type,
  unlock_value,
  delivery_mode,
  protected_ttl_seconds,
  one_time_unlock,
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
  '0x1111111111111111111111111111111111111111',
  1,
  'json',
  '{"title":"Exclusive video - Production","kind":"video","deliveryUrl":"https://402.earth/demo/exclusive-video"}',
  'direct',
  NULL,
  0,
  NULL,
  '/success/demo-001',
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR REPLACE INTO resource_definitions (
  slug,
  label,
  amount,
  currency,
  network,
  receiver_address,
  active,
  unlock_type,
  unlock_value,
  delivery_mode,
  protected_ttl_seconds,
  one_time_unlock,
  content_type,
  success_redirect_path,
  created_at,
  updated_at
) VALUES (
  'demo-protected-link',
  'Protected link demo',
  '1.00',
  'USDC',
  'base',
  '0x1111111111111111111111111111111111111111',
  1,
  'link',
  'https://402.earth/demo/protected-destination',
  'protected',
  NULL,
  1,
  NULL,
  '/success/demo-protected-link',
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
