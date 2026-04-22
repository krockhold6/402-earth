import { getCapabilityJobResult } from '../db/capabilityJobResults'
import { getCapabilityJobById } from '../db/capabilityJobs'
import { deriveResultRetentionPublicState } from '../lib/capabilityResultSemantics'
import { json } from '../lib/response'
import type { Env } from '../types/env'

/**
 * GET — full stored result body for completed async jobs (when inline storage was used).
 */
export async function handleGetCapabilityJobResult(
  env: Env,
  jobId: string,
): Promise<Response> {
  const job = await getCapabilityJobById(env.DB, jobId)
  if (!job) {
    return json(
      {
        ok: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      },
      { status: 404 },
    )
  }

  if (job.status !== 'completed') {
    return json(
      {
        ok: false,
        error: 'Result is not available until the job completes',
        code: 'RESULT_NOT_READY',
      },
      { status: 409 },
    )
  }

  const retention = deriveResultRetentionPublicState(job)
  if (retention === 'expired' || retention === 'deleted') {
    return json(
      {
        ok: false,
        error: 'Stored result has expired or been removed',
        code: 'RESULT_EXPIRED_OR_PURGED',
        retention_state: retention,
      },
      { status: 410 },
    )
  }

  if (!job.resultAvailable) {
    return json(
      {
        ok: false,
        error:
          'Full result storage is not available for this job; use result_preview on the job poll endpoint',
        code: 'RESULT_NOT_STORED',
      },
      { status: 404 },
    )
  }

  if (job.resultStorageKind === 'd1_inline') {
    const row = await getCapabilityJobResult(env.DB, jobId)
    if (!row) {
      return json(
        {
          ok: false,
          error: 'Stored result expired or was removed',
          code: 'RESULT_EXPIRED_OR_PURGED',
        },
        { status: 410 },
      )
    }

    return new Response(row.bodyText, {
      status: 200,
      headers: {
        'content-type': row.contentType,
        'cache-control': 'private, no-store',
        'x-result-size-bytes': String(row.sizeBytes),
      },
    })
  }

  if (job.resultStorageKind === 'r2_object' && job.resultStorageKey) {
    if (!env.CAPABILITY_RESULTS) {
      return json(
        {
          ok: false,
          error: 'Result storage is not configured in this environment',
          code: 'RESULT_STORAGE_UNAVAILABLE',
        },
        { status: 503 },
      )
    }
    const obj = await env.CAPABILITY_RESULTS.get(job.resultStorageKey)
    if (!obj) {
      return json(
        {
          ok: false,
          error: 'Stored result expired or was removed',
          code: 'RESULT_EXPIRED_OR_PURGED',
        },
        { status: 410 },
      )
    }
    const body = await obj.text()
    const ct =
      obj.httpMetadata?.contentType ?? 'text/plain; charset=utf-8'
    const sizeBytes = new TextEncoder().encode(body).byteLength
    if (
      job.resultExpiresAt &&
      Date.parse(job.resultExpiresAt) < Date.now()
    ) {
      return json(
        {
          ok: false,
          error: 'Result retention period has expired',
          code: 'RESULT_EXPIRED_OR_PURGED',
        },
        { status: 410 },
      )
    }
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': ct,
        'cache-control': 'private, no-store',
        'x-result-size-bytes': String(sizeBytes),
        'x-result-storage-kind': 'r2_object',
      },
    })
  }

  return json(
    {
      ok: false,
      error:
        'Full result storage is not available for this job; use result_preview on the job poll endpoint',
      code: 'RESULT_NOT_STORED',
    },
    { status: 404 },
  )
}
