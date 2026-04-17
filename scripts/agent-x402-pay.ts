#!/usr/bin/env tsx
/**
 * =============================================================================
 * DEV-ONLY — AGENT x402 PAYMENT SCRIPT
 * =============================================================================
 * Simulates an autonomous agent: HTTP 402 challenge → on-chain USDC transfer
 * on Base → retry with PAYMENT-SIGNATURE (tx hash).
 *
 * NOT production custody logic. Use a disposable hot wallet with minimal USDC.
 * Do not use high-value keys or main treasuries.
 *
 * Environment (names overridable via --private-key-env / --rpc-env):
 *   AGENT_PRIVATE_KEY  — 0x-prefixed secp256k1 private key (32 bytes hex)
 *   BASE_RPC_URL       — HTTPS JSON-RPC for Base mainnet (e.g. https://mainnet.base.org)
 * =============================================================================
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { erc20Abi } from 'viem'

import {
  fetchPaymentAttempt,
  payUrl,
  postPaymentAttempt,
  readBodyPreview,
} from './lib/x402AgentHttp.js'
import { parseUsdcMinorUnits } from './lib/x402Amount.js'
import {
  decodePaymentRequiredHeader,
  getHeader,
  pickImportantResponseHeaders,
} from './lib/x402Wire.js'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

type Args = {
  slug: string
  apiOrigin: string
  attemptId: string | null
  noAttempt: boolean
  privateKeyEnv: string
  rpcEnv: string
  dryRun: boolean
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===\n`)
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function printBanner(): void {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ DEV-ONLY x402 agent payment                                                 │
│ Hot wallet only · minimal funds · not production-safe                     │
└─────────────────────────────────────────────────────────────────────────────┘`)
}

function printHelp(): void {
  console.error(`
Usage: npm run agent:x402:pay -- --slug <slug> [options]

Required:
  --slug <slug>              Resource slug

Options:
  --api <origin>             API base URL (default: https://api.402.earth)
  --attempt <id>             Existing payment attempt id
  --no-attempt               Skip POST /api/payment-attempt; slug-only challenge
  --private-key-env <NAME>   Env var for private key (default: AGENT_PRIVATE_KEY)
  --rpc-env <NAME>           Env var for Base RPC URL (default: BASE_RPC_URL)
  --dry-run                  Simulate USDC transfer; do not broadcast
  -h, --help                 Show this help

Environment (defaults):
  AGENT_PRIVATE_KEY   0x… hex private key (never commit; never log)
  BASE_RPC_URL        Base mainnet JSON-RPC HTTPS URL

Slug-only (--no-attempt): the worker still returns PAYMENT-REQUIRED with payTo
and amount, but PAYMENT-SIGNATURE retry requires ?attemptId= on the URL.
This script will not send a transaction in that mode and exits with an error
after printing the challenge.
`)
}

function parseArgs(argv: string[]): Args {
  let slug: string | undefined
  let apiOrigin = 'https://api.402.earth'
  let attemptId: string | null = null
  let noAttempt = false
  let privateKeyEnv = 'AGENT_PRIVATE_KEY'
  let rpcEnv = 'BASE_RPC_URL'
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--slug') {
      slug = argv[++i]?.trim()
      continue
    }
    if (a === '--api') {
      apiOrigin = (argv[++i] ?? '').replace(/\/$/, '')
      continue
    }
    if (a === '--attempt') {
      attemptId = (argv[++i] ?? '').trim() || null
      continue
    }
    if (a === '--no-attempt') {
      noAttempt = true
      continue
    }
    if (a === '--private-key-env') {
      privateKeyEnv = (argv[++i] ?? '').trim() || 'AGENT_PRIVATE_KEY'
      continue
    }
    if (a === '--rpc-env') {
      rpcEnv = (argv[++i] ?? '').trim() || 'BASE_RPC_URL'
      continue
    }
    if (a === '--dry-run') {
      dryRun = true
      continue
    }
    if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    }
    console.error(`Unknown argument: ${a}`)
    printHelp()
    process.exit(1)
  }

  if (!slug) {
    console.error('Missing required --slug <slug>')
    printHelp()
    process.exit(1)
  }
  if (noAttempt && attemptId) {
    console.error('Cannot use --no-attempt together with --attempt')
    process.exit(1)
  }

  return { slug, apiOrigin, attemptId, noAttempt, privateKeyEnv, rpcEnv, dryRun }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return v
}

function isHexPrivateKey(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s.trim())
}

type WireRequirement = {
  scheme: string
  network: string
  currency: string
  amount: string
  payTo: string
  resource: string
  slug: string
  attemptId: string | null
}

function parseWireRequirement(
  decoded: Record<string, unknown>,
): { ok: true; req: WireRequirement } | { ok: false; message: string } {
  const str = (k: string): string | null => {
    const v = decoded[k]
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  const scheme = str('scheme')
  const network = str('network')
  const currency = str('currency')
  const amount = str('amount')
  const payTo = str('payTo')
  const resource = str('resource')
  const slug = str('slug')
  const attemptRaw = decoded.attemptId
  const attemptId =
    typeof attemptRaw === 'string' && attemptRaw.trim()
      ? attemptRaw.trim()
      : null

  if (!scheme) return { ok: false, message: 'Missing scheme in PAYMENT-REQUIRED' }
  if (!network) return { ok: false, message: 'Missing network' }
  if (!currency) return { ok: false, message: 'Missing currency' }
  if (!amount) return { ok: false, message: 'Missing amount' }
  if (!payTo) return { ok: false, message: 'Missing payTo' }
  if (!resource) return { ok: false, message: 'Missing resource' }
  if (!slug) return { ok: false, message: 'Missing slug' }

  return {
    ok: true,
    req: {
      scheme,
      network,
      currency,
      amount,
      payTo,
      resource,
      slug,
      attemptId,
    },
  }
}

async function fetchChallenge(
  url: string,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(url, { headers, redirect: 'manual' })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  printBanner()
  const { slug, apiOrigin, noAttempt, privateKeyEnv, rpcEnv, dryRun } = args
  let attemptId = args.attemptId

  if (!attemptId && !noAttempt) {
    printSection('Create Attempt')
    try {
      const created = await postPaymentAttempt(apiOrigin, slug)
      attemptId = created.attemptId
      console.log(prettyJson(created.raw))
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  } else if (attemptId) {
    printSection('Using Existing Attempt')
    console.log(`attemptId: ${attemptId}`)
  } else {
    printSection('Slug-Only Challenge')
    console.log(
      'Using --no-attempt: GET /x402/pay/:slug without ?attemptId=.\n' +
        'The worker requires attemptId in the URL to accept PAYMENT-SIGNATURE; this script will stop after the challenge.',
    )
  }

  const challengeUrl = payUrl(apiOrigin, slug, attemptId)

  printSection('Challenge')
  const challengeRes = await fetchChallenge(challengeUrl)
  const challengeBody = await readBodyPreview(challengeRes)
  const paymentRequiredRaw = getHeader(challengeRes.headers, 'PAYMENT-REQUIRED')

  console.log(`URL: ${challengeUrl}`)
  console.log(`HTTP ${challengeRes.status}`)
  console.log(`PAYMENT-REQUIRED (raw): ${paymentRequiredRaw ?? '(none)'}`)
  if (challengeBody.json !== null) {
    console.log('Body (JSON):')
    console.log(prettyJson(challengeBody.json))
  } else {
    console.log('Body (text):')
    console.log(challengeBody.text)
  }

  if (challengeRes.status !== 402) {
    console.error(
      `Expected HTTP 402 Payment Required, got ${challengeRes.status}. Refusing to pay.`,
    )
    process.exit(1)
  }
  if (!paymentRequiredRaw?.trim()) {
    console.error('HTTP 402 but PAYMENT-REQUIRED header is missing or empty.')
    process.exit(1)
  }

  const decoded = decodePaymentRequiredHeader(paymentRequiredRaw)
  if (!decoded) {
    console.error(
      'PAYMENT-REQUIRED header is present but malformed (expected base64(JSON object) or legacy JSON).',
    )
    process.exit(1)
  }

  printSection('Decoded Requirement')
  console.log(prettyJson(decoded))

  const parsed = parseWireRequirement(decoded)
  if (!parsed.ok) {
    console.error(parsed.message)
    process.exit(1)
  }
  const req = parsed.req

  if (noAttempt || attemptId === null) {
    console.error(
      '\nCannot proceed with on-chain payment + PAYMENT-SIGNATURE retry without an attempt id on the URL.\n' +
        'Omit --no-attempt (default creates POST /api/payment-attempt) or pass --attempt <id>.\n' +
        'The PAYMENT-REQUIRED payload may still list payTo/amount, but the worker rejects PAYMENT-SIGNATURE without ?attemptId=.',
    )
    process.exit(1)
  }

  if (req.network.toLowerCase() !== 'base') {
    console.error(`Unsupported network: ${req.network} (this script only supports base)`)
    process.exit(1)
  }
  if (req.currency.toUpperCase() !== 'USDC') {
    console.error(`Unsupported currency: ${req.currency} (this script only supports USDC)`)
    process.exit(1)
  }
  if (!isAddress(req.payTo)) {
    console.error(`Invalid payTo address: ${req.payTo}`)
    process.exit(1)
  }

  const minor = parseUsdcMinorUnits(req.amount)
  if (minor === null) {
    console.error(`Invalid USDC amount string: ${req.amount}`)
    process.exit(1)
  }
  if (minor <= 0n) {
    console.error('Amount must be positive (minor units).')
    process.exit(1)
  }

  const privateKey = requireEnv(privateKeyEnv)
  const rpcUrl = requireEnv(rpcEnv)
  if (!isHexPrivateKey(privateKey)) {
    console.error(
      `Private key from ${privateKeyEnv} must be 0x-prefixed 64 hex characters (32 bytes).`,
    )
    process.exit(1)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const transport = http(rpcUrl)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport,
  })
  const publicClient = createPublicClient({
    chain: base,
    transport,
  })

  printSection('Payment Transaction')
  console.log(`scheme:   ${req.scheme}`)
  console.log(`sender:   ${account.address}`)
  console.log(`recipient: ${req.payTo}`)
  console.log(`amount:   ${req.amount} (${minor.toString()} minor units, 6 decimals)`)
  console.log(`token:    ${USDC_BASE}`)
  console.log(`chain:    Base (id ${base.id})`)
  console.log(`dry-run:  ${dryRun}`)

  if (dryRun) {
    try {
      const { request } = await publicClient.simulateContract({
        account,
        address: USDC_BASE,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [req.payTo as `0x${string}`, minor],
      })
      console.log('\nDry-run: simulated transfer request (not broadcast):')
      console.log(prettyJson(request as unknown))
    } catch (e) {
      console.error('Dry-run simulation failed:', e instanceof Error ? e.message : e)
      process.exit(1)
    }
    console.log('\nExiting before broadcast (--dry-run).')
    process.exit(0)
  }

  let txHash: `0x${string}`
  try {
    txHash = await walletClient.writeContract({
      address: USDC_BASE,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [req.payTo as `0x${string}`, minor],
      chain: base,
    })
  } catch (e) {
    console.error('USDC transfer failed:', e instanceof Error ? e.message : e)
    process.exit(1)
  }

  console.log(`\ntx hash: ${txHash}`)
  let receipt
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  } catch (e) {
    console.error('Waiting for receipt failed:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
  console.log(`receipt status: ${receipt.status}`)
  console.log(`explorer: https://basescan.org/tx/${txHash}`)

  printSection('Retry With PAYMENT-SIGNATURE')
  const retryRes = await fetchChallenge(challengeUrl, {
    'PAYMENT-SIGNATURE': txHash,
  })
  const retryBody = await readBodyPreview(retryRes)
  console.log(`HTTP ${retryRes.status}`)
  console.log('Relevant headers:')
  console.log(prettyJson(pickImportantResponseHeaders(retryRes)))
  if (retryBody.json !== null) {
    console.log('Body (JSON):')
    console.log(prettyJson(retryBody.json))
  } else {
    console.log('Body (text):')
    console.log(retryBody.text)
  }

  printSection('Final Attempt State')
  const final = await fetchPaymentAttempt(apiOrigin, attemptId)
  console.log(`HTTP ${final.status}`)
  if (final.json !== null) {
    console.log(prettyJson(final.json))
    const root =
      final.json && typeof final.json === 'object' && !Array.isArray(final.json)
        ? (final.json as Record<string, unknown>)
        : null
    const att = root?.attempt
    const o =
      att && typeof att === 'object' && !Array.isArray(att)
        ? (att as Record<string, unknown>)
        : null
    if (o) {
      const pick = (k: string) => o[k]
      console.log('\nSummary fields (attempt):')
      console.log(`  status:          ${String(pick('status') ?? '')}`)
      console.log(`  txHash:          ${String(pick('txHash') ?? '')}`)
      console.log(`  payerAddress:    ${String(pick('payerAddress') ?? '')}`)
      console.log(`  receiverAddress: ${String(pick('receiverAddress') ?? '')}`)
    }
  } else {
    console.log(final.text)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
