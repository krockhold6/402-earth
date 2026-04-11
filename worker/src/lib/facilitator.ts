import type { Env } from '../types/env'
import type { PaymentAttempt } from '../types/payment'

/** Outcome of x402 payment proof verification (facilitator or mock). */
export type VerificationResult =
  | {
      ok: true
      payerAddress: string
      txHash: string
      network: 'base'
    }
  | {
      ok: false
      error: string
      code?: string
    }

/** Inputs for facilitator verification; stable contract for swapping implementations. */
export type FacilitatorVerifyInput = {
  attempt: PaymentAttempt
  slug: string
  paymentSignature: string
  /** SHA-256 hex of `paymentSignature` (UTF-8); precomputed by the route. */
  paymentSignatureHash: string
  /** When set (non-mock), verify USDC transfer on Base via this tx hash. */
  txHash?: string | null
}

const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC0 =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export function mockVerifyEnabled(env: Env): boolean {
  const v = env.X402_MOCK_VERIFY?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function normalizeAddr(hex: string): string {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  return h.slice(-40).toLowerCase()
}

function addrWith0x(normalized40: string): string {
  return `0x${normalized40}`
}

function topicToAddress(topic: string): string {
  return addrWith0x(normalizeAddr(topic))
}

function parseUsdcMinorUnits(amountStr: string): bigint | null {
  const t = amountStr.trim()
  if (!t) return null
  const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(t)
  if (!m) return null
  const fracRaw = m[2] ?? ''
  if (fracRaw.length > 6) return null
  const frac = fracRaw.padEnd(6, '0')
  try {
    return BigInt(m[1]) * 1_000_000n + BigInt(frac === '' ? '0' : frac)
  } catch {
    return null
  }
}

function isTxHash(s: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(s)
}

type RpcReceipt = {
  logs?: Array<{
    address?: string
    topics?: string[]
    data?: string
  }>
}

async function fetchReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<{ ok: true; receipt: RpcReceipt | null } | { ok: false }> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1,
      }),
    })
    if (!res.ok) return { ok: false }
    const body = (await res.json()) as {
      result?: RpcReceipt | null
      error?: { message?: string }
    }
    if (body.error) return { ok: false }
    return { ok: true, receipt: body.result ?? null }
  } catch {
    return { ok: false }
  }
}

function verifyTransferLogs(
  receipt: RpcReceipt,
  usdc: string,
  receiverNorm: string,
  expectedMinor: bigint,
): { from: string } | null {
  const logs = receipt.logs ?? []
  const usdcNorm = normalizeAddr(usdc)

  for (const log of logs) {
    const addr = log.address
    if (!addr || normalizeAddr(addr) !== usdcNorm) continue
    const topics = log.topics
    if (!topics || topics.length < 3) continue
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC0) continue
    const data = log.data
    if (!data || data === '0x') continue
    const toAddr = topicToAddress(topics[2]!)
    if (normalizeAddr(toAddr) !== receiverNorm) continue

    let value: bigint
    try {
      const hex = data.startsWith('0x') ? data : `0x${data}`
      value = BigInt(hex)
    } catch {
      continue
    }

    if (value >= expectedMinor) {
      return { from: topicToAddress(topics[1]!) }
    }
  }
  return null
}

/**
 * Verify an x402 payment: mock when `X402_MOCK_VERIFY` is set; otherwise Base USDC
 * transfer to `PAYMENT_RECEIVER_ADDRESS` via `txHash`.
 */
export async function verifyWithFacilitator(
  env: Env,
  input: FacilitatorVerifyInput,
): Promise<VerificationResult> {
  if (mockVerifyEnabled(env)) {
    const h = input.paymentSignatureHash
    return {
      ok: true,
      payerAddress: `0x${h.slice(0, 40).padEnd(40, '0')}`,
      txHash: `0x${h.slice(0, 64).padEnd(64, '0')}`,
      network: 'base',
    }
  }

  const rpcUrl = env.BASE_RPC_URL?.trim()
  const receiverRaw = env.PAYMENT_RECEIVER_ADDRESS?.trim()
  if (!rpcUrl || !receiverRaw) {
    return {
      ok: false,
      error:
        'Base USDC verification is not configured. Set BASE_RPC_URL and PAYMENT_RECEIVER_ADDRESS, or X402_MOCK_VERIFY=true for local mock only.',
      code: 'FACILITATOR_NOT_CONFIGURED',
    }
  }

  const txHash = input.txHash?.trim() ?? ''
  if (!txHash) {
    return {
      ok: false,
      error: 'txHash is required for on-chain verification',
      code: 'TX_HASH_REQUIRED',
    }
  }
  if (!isTxHash(txHash)) {
    return { ok: false, error: 'Invalid txHash', code: 'INVALID_TX_HASH' }
  }

  if (input.attempt.currency.toUpperCase() !== 'USDC') {
    return { ok: false, error: 'PAYMENT_NOT_FOUND', code: 'UNSUPPORTED_CURRENCY' }
  }
  if (input.attempt.network.toLowerCase() !== 'base') {
    return { ok: false, error: 'PAYMENT_NOT_FOUND', code: 'UNSUPPORTED_NETWORK' }
  }

  const expectedMinor = parseUsdcMinorUnits(input.attempt.amount)
  if (expectedMinor === null) {
    return { ok: false, error: 'PAYMENT_NOT_FOUND', code: 'INVALID_AMOUNT' }
  }

  const receiptResult = await fetchReceipt(rpcUrl, txHash)
  if (!receiptResult.ok) {
    return { ok: false, error: 'RPC_ERROR' }
  }
  if (receiptResult.receipt === null) {
    return { ok: false, error: 'TX_NOT_FOUND' }
  }

  const receiverNorm = normalizeAddr(receiverRaw)
  const match = verifyTransferLogs(
    receiptResult.receipt,
    USDC_BASE,
    receiverNorm,
    expectedMinor,
  )
  if (!match) {
    return { ok: false, error: 'PAYMENT_NOT_FOUND' }
  }

  return {
    ok: true,
    txHash,
    payerAddress: match.from,
    network: 'base',
  }
}
