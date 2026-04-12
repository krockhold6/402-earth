import { resolveExpectedReceiver } from './receiverAddress'
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

/** USDC on Base mainnet (ERC-20). */
export const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
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

export function parseUsdcMinorUnits(amountStr: string): bigint | null {
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
 * transfer to the attempt’s `receiver_address` (or legacy global `PAYMENT_RECEIVER_ADDRESS` when the attempt still has the migration placeholder).
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
  const receiverRaw = resolveExpectedReceiver(input.attempt, env)
  if (!rpcUrl || !receiverRaw) {
    return {
      ok: false,
      error:
        'Base USDC verification is not configured. Set BASE_RPC_URL, ensure the payment attempt has a receiver address, or set PAYMENT_RECEIVER_ADDRESS for legacy resources; or use X402_MOCK_VERIFY=true for local mock only.',
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

const BASE_AVG_BLOCK_TIME_SEC = 2
/** Cap RPC `eth_getLogs` range (Base ~2s blocks → ~25h). */
const MAX_LOOKBACK_BLOCKS = 45_000
const LOG_CHUNK_BLOCKS = 1_500
/** Ignore transfers in blocks this many seconds before `created_at` (clock skew). */
const CREATED_AT_BLOCK_TS_BUFFER_SEC = 120

type RpcLogEntry = {
  address?: string
  topics?: string[]
  data?: string
  blockNumber?: string
  transactionHash?: string
  logIndex?: string
}

type ScannedTransfer = {
  txHash: string
  payerAddress: string
  blockNumber: number
  logIndex: number
}

async function jsonRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<{ ok: true; result: unknown } | { ok: false }> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
    })
    if (!res.ok) return { ok: false }
    const body = (await res.json()) as {
      result?: unknown
      error?: { message?: string }
    }
    if (body.error) return { ok: false }
    return { ok: true, result: body.result }
  } catch {
    return { ok: false }
  }
}

function hexToBigInt(hex: string): bigint {
  const h = hex.startsWith('0x') ? hex : `0x${hex}`
  return BigInt(h)
}

function padAddressTopic(receiverNorm40: string): string {
  return `0x${'0'.repeat(24)}${receiverNorm40}`
}

function createdAtToUnixSec(iso: string): number | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / 1000)
}

function computeFromBlock(
  latestNum: number,
  latestTs: number,
  createdTs: number,
): number {
  if (createdTs >= latestTs) return latestNum
  const secBehind = latestTs - createdTs + CREATED_AT_BLOCK_TS_BUFFER_SEC
  const approxBlocks = Math.ceil(secBehind / BASE_AVG_BLOCK_TIME_SEC)
  const span = Math.min(approxBlocks, MAX_LOOKBACK_BLOCKS)
  return Math.max(0, latestNum - span)
}

/**
 * Scan recent Base USDC Transfer logs to `receiverAddress` and return the earliest
 * qualifying transfer (by block, then log index) for which `allowTxHash` resolves true.
 */
export async function findAutoUsdcTransferOnBase(
  env: Env,
  input: {
    receiverAddress: string
    minimumAmountMinor: bigint
    attemptCreatedAtIso: string
    allowTxHash: (txHash: string) => Promise<boolean>
  },
): Promise<{ txHash: string; payerAddress: string } | null> {
  const rpcUrl = env.BASE_RPC_URL?.trim()
  if (!rpcUrl) return null

  const receiverNorm = normalizeAddr(input.receiverAddress)
  const topicTo = padAddressTopic(receiverNorm)

  const latestBlock = await jsonRpc(rpcUrl, 'eth_getBlockByNumber', [
    'latest',
    false,
  ])
  if (!latestBlock.ok || latestBlock.result == null || typeof latestBlock.result !== 'object') {
    return null
  }
  const lb = latestBlock.result as { number?: string; timestamp?: string }
  if (!lb.number || !lb.timestamp) return null
  const latestNum = Number(hexToBigInt(lb.number))
  const latestTs = Number(hexToBigInt(lb.timestamp))
  const createdTs =
    createdAtToUnixSec(input.attemptCreatedAtIso) ?? latestTs - 3600
  const minBlockTs = createdTs - CREATED_AT_BLOCK_TS_BUFFER_SEC

  const fromBlock = computeFromBlock(latestNum, latestTs, createdTs)
  const candidates: ScannedTransfer[] = []

  let chunkStart = fromBlock
  while (chunkStart <= latestNum) {
    const chunkEnd = Math.min(chunkStart + LOG_CHUNK_BLOCKS - 1, latestNum)
    const logsRes = await jsonRpc(rpcUrl, 'eth_getLogs', [
      {
        address: USDC_BASE,
        topics: [TRANSFER_TOPIC0, null, topicTo],
        fromBlock: `0x${chunkStart.toString(16)}`,
        toBlock: `0x${chunkEnd.toString(16)}`,
      },
    ])
    if (!logsRes.ok || !Array.isArray(logsRes.result)) {
      chunkStart = chunkEnd + 1
      continue
    }

    for (const raw of logsRes.result as RpcLogEntry[]) {
      const topics = raw.topics
      const data = raw.data
      const txHash = raw.transactionHash
      const bn = raw.blockNumber
      const li = raw.logIndex
      if (!topics || topics.length < 3 || !data || !txHash || !bn || !li) continue
      if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC0) continue

      let value: bigint
      try {
        value = hexToBigInt(data)
      } catch {
        continue
      }
      if (value < input.minimumAmountMinor) continue

      const payerAddress = topicToAddress(topics[1]!)
      candidates.push({
        txHash,
        payerAddress,
        blockNumber: Number(hexToBigInt(bn)),
        logIndex: Number(hexToBigInt(li)),
      })
    }
    chunkStart = chunkEnd + 1
  }

  if (candidates.length === 0) return null

  const blockNums = [...new Set(candidates.map((c) => c.blockNumber))]
  const tsByBlock = new Map<number, number>()
  for (const bn of blockNums) {
    const blk = await jsonRpc(rpcUrl, 'eth_getBlockByNumber', [
      `0x${bn.toString(16)}`,
      false,
    ])
    if (!blk.ok || blk.result == null || typeof blk.result !== 'object') continue
    const tsHex = (blk.result as { timestamp?: string }).timestamp
    if (!tsHex) continue
    tsByBlock.set(bn, Number(hexToBigInt(tsHex)))
  }

  const filtered = candidates.filter((c) => {
    const ts = tsByBlock.get(c.blockNumber)
    if (ts === undefined) return false
    return ts >= minBlockTs
  })

  filtered.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
    return a.logIndex - b.logIndex
  })

  for (const c of filtered) {
    const ok = await input.allowTxHash(c.txHash)
    if (ok) {
      return { txHash: c.txHash, payerAddress: c.payerAddress }
    }
  }

  return null
}
