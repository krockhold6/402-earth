import {
  avgCompletedCapabilityDurationMs,
  countCapabilityJobsByStatus,
  failureCountsByOriginHost,
  recentFailedCapabilityJobs,
} from '../db/capabilityJobs'
import { json } from '../lib/response'
import type { Env } from '../types/env'

/** GET — operational summary for capability async execution (auth required). */
export async function handleGetCapabilityOpsSummary(env: Env): Promise<Response> {
  const [byStatus, avgMs, recent, byHost] = await Promise.all([
    countCapabilityJobsByStatus(env.DB),
    avgCompletedCapabilityDurationMs(env.DB),
    recentFailedCapabilityJobs(env.DB, 25),
    failureCountsByOriginHost(env.DB, 20),
  ])

  return json({
    ok: true,
    generated_at: new Date().toISOString(),
    jobs_by_status: byStatus,
    avg_completed_duration_ms: avgMs,
    recent_failures: recent,
    failures_by_origin_host: byHost,
  })
}
