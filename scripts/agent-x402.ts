#!/usr/bin/env node
/**
 * Dev/agent tool: exercise GET /x402/pay/:slug without the UI.
 * Optional POST /api/payment-attempt, PAYMENT-SIGNATURE retry, GET /api/payment-attempt/:id.
 */

import {
  fetchPaymentAttempt,
  payUrl,
  postPaymentAttempt,
  readBodyPreview,
} from './lib/x402AgentHttp.js'
import {
  decodePaymentRequiredHeader,
  getHeader,
  pickImportantResponseHeaders,
} from './lib/x402Wire.js'

type Args = {
  slug: string
  apiOrigin: string
  txHash: string | null
  attemptId: string | null
  noAttempt: boolean
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===\n`)
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseArgs(argv: string[]): Args {
  let slug: string | undefined
  let apiOrigin = 'https://api.402.earth'
  let txHash: string | null = null
  let attemptId: string | null = null
  let noAttempt = false

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
    if (a === '--tx') {
      txHash = (argv[++i] ?? '').trim() || null
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
  if (txHash && noAttempt) {
    console.error('PAYMENT-SIGNATURE verification requires attemptId. Omit --no-attempt or pass --attempt.')
    process.exit(1)
  }

  return { slug, apiOrigin, txHash, attemptId, noAttempt }
}

function printHelp(): void {
  console.error(`
Usage: agent:x402 -- --slug <slug> [options]

Options:
  --slug <slug>       Resource slug (required)
  --api <origin>      API base URL (default: https://api.402.earth)
  --attempt <id>      Use an existing payment attempt id
  --no-attempt        Do not POST /api/payment-attempt; challenge without ?attemptId=
  --tx <txHash>       After challenge, retry with PAYMENT-SIGNATURE header
  -h, --help          Show this help
`)
}

async function getPaymentAttempt(origin: string, id: string): Promise<void> {
  const { status, json, text } = await fetchPaymentAttempt(origin, id)
  console.log(`HTTP ${status}`)
  if (json !== null) {
    console.log(prettyJson(json))
  } else {
    console.log(text)
  }
}

async function runChallenge(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  return fetch(url, {
    headers: extraHeaders,
    redirect: 'manual',
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { slug, apiOrigin, txHash, noAttempt } = args
  let attemptId = args.attemptId

  if (!attemptId && !noAttempt) {
    printSection('Create Attempt')
    let created: { attemptId: string; raw: unknown }
    try {
      created = await postPaymentAttempt(apiOrigin, slug)
    } catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
    attemptId = created.attemptId
    console.log(prettyJson(created.raw))
  } else if (attemptId) {
    printSection('Using Existing Attempt')
    console.log(`attemptId: ${attemptId}`)
  } else {
    printSection('Slug-Only Challenge')
    console.log('No attempt id (--no-attempt): calling GET /x402/pay/:slug without query.')
  }

  const challengeUrl = payUrl(apiOrigin, slug, attemptId)

  printSection('Challenge Response')
  const challengeRes = await runChallenge(challengeUrl)
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

  printSection('Decoded PAYMENT-REQUIRED')
  if (challengeRes.status === 402) {
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
    console.log(prettyJson(decoded))
  } else {
    console.log(
      `Not HTTP 402 (got ${challengeRes.status}); skipping strict PAYMENT-REQUIRED validation.`,
    )
    if (paymentRequiredRaw?.trim()) {
      const decoded = decodePaymentRequiredHeader(paymentRequiredRaw)
      console.log(decoded ? prettyJson(decoded) : 'Header present but could not be decoded.')
    } else {
      console.log('No PAYMENT-REQUIRED header (resource may already be unlocked or endpoint returned an error body above).')
    }
  }

  if (txHash && attemptId) {
    printSection('Retry With PAYMENT-SIGNATURE')
    const retryRes = await runChallenge(challengeUrl, {
      'PAYMENT-SIGNATURE': txHash,
    })
    const retryBody = await readBodyPreview(retryRes)
    console.log(`HTTP ${retryRes.status}`)
    console.log('Important headers:')
    console.log(prettyJson(pickImportantResponseHeaders(retryRes)))
    if (retryBody.json !== null) {
      console.log('Body (JSON):')
      console.log(prettyJson(retryBody.json))
    } else {
      console.log('Body (text):')
      console.log(retryBody.text)
    }
  } else if (txHash) {
    // Guarded above; should not happen
    console.error('Internal error: tx without attemptId')
    process.exit(1)
  }

  if (attemptId) {
    printSection('Final Attempt State')
    await getPaymentAttempt(apiOrigin, attemptId)
  } else {
    printSection('Final Attempt State')
    console.log('Skipped (no attemptId). Use --attempt or omit --no-attempt to poll GET /api/payment-attempt/:id.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
