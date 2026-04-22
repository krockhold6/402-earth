import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle3,
} from "@coinbase/cds-web/typography"
import {
  fetchCapabilityJob,
  fetchPaidX402Resource,
  type CapabilityBuyerOutcomeSummary,
  type CapabilityJobPollResponse,
} from "@/lib/api"
import {
  buyerCapabilityOutcomePath,
  buyerCapabilityResultPath,
  unlockPagePath,
} from "@/lib/appUrl"

const POLL_MS = 2500

function formatTs(value: string | null, empty: string) {
  if (!value) return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack
      justifyContent="space-between"
      alignItems="flex-start"
      gap={2}
      width="100%"
    >
      <TextBody color="fgMuted" flexShrink={0}>
        {label}
      </TextBody>
      <TextBody
        color="fg"
        fontWeight="label1"
        textAlign="end"
        minWidth={0}
        overflow="wrap"
      >
        {value}
      </TextBody>
    </HStack>
  )
}

function readJsonRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

export default function BuyerCapabilityOutcomePage() {
  const { t } = useTranslation()
  const { slug: slugParam, attemptId: attemptParam } = useParams()
  const slug = slugParam?.trim() ?? ""
  const attemptId = attemptParam?.trim() ?? ""

  const [paid, setPaid] = useState<Awaited<
    ReturnType<typeof fetchPaidX402Resource>
  > | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showTechnical, setShowTechnical] = useState(false)
  const [job, setJob] = useState<CapabilityJobPollResponse | null>(null)

  useEffect(() => {
    if (!slug || !attemptId) return
    let cancelled = false
    ;(async () => {
      const r = await fetchPaidX402Resource(slug, attemptId)
      if (cancelled) return
      setPaid(r)
      if (
        !r.response.ok ||
        r.data?.ok !== true ||
        r.data.status !== "paid"
      ) {
        setLoadError(
          r.data?.error?.trim() ||
            t("capabilityOutcome.loadFailed", { status: r.response.status }),
        )
        return
      }
      setLoadError(null)
    })()
    return () => {
      cancelled = true
    }
  }, [slug, attemptId, t])

  const outcome = paid?.data?.capability_buyer_outcome as
    | CapabilityBuyerOutcomeSummary
    | undefined

  const resourceVal = readJsonRecord(paid?.data?.resource?.value)
  const fulfillment = String(resourceVal?.fulfillment ?? "")
  const proxyUrl =
    typeof resourceVal?.proxy_url === "string"
      ? resourceVal.proxy_url.trim()
      : ""
  const asyncJobId =
    typeof resourceVal?.async_job_id === "string"
      ? resourceVal.async_job_id.trim()
      : outcome?.async_job_id?.trim() ?? ""

  const jobDetailHref =
    slug && asyncJobId
      ? buyerCapabilityResultPath(slug, asyncJobId, attemptId)
      : null

  useEffect(() => {
    if (fulfillment !== "async" || !asyncJobId) {
      setJob(null)
      return
    }
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      const j = await fetchCapabilityJob(asyncJobId)
      if (cancelled) return
      setJob(j)
      const st = j.status
      if (st === "completed" || st === "failed") {
        if (timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      }
    }
    timer = window.setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [fulfillment, asyncJobId])

  const receiptJson = useMemo(() => {
    const r = paid?.data?.capabilityReceipt
    if (r && typeof r === "object" && !Array.isArray(r)) {
      return JSON.stringify(r, null, 2)
    }
    return null
  }, [paid?.data?.capabilityReceipt])

  const selfHref = buyerCapabilityOutcomePath(slug, attemptId)

  if (!slug || !attemptId) {
    return (
      <Box as="main" padding={4} background="bg" color="fg">
        <TextBody color="fgMuted">{t("capabilityOutcome.missingRoute")}</TextBody>
      </Box>
    )
  }

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      background="bg"
      color="fg"
      style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
    >
      <Box width="100%" maxWidth="32rem" padding={{ base: 3, desktop: 5 }}>
        <VStack gap={3} alignItems="stretch" width="100%">
          <VStack gap={1} alignItems="flex-start">
            <Link
              to={unlockPagePath(slug, attemptId)}
              style={{ textDecoration: "none" }}
            >
              <TextCaption color="fgMuted" as="span">
                ← {t("capabilityOutcome.backUnlock")}
              </TextCaption>
            </Link>
            <Link
              to={`/success/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`}
              style={{ textDecoration: "none" }}
            >
              <TextCaption color="fgMuted" as="span">
                {t("capabilityOutcome.linkSuccess")}
              </TextCaption>
            </Link>
          </VStack>

          <ContentCard width="100%" bordered background="bgSecondary" padding={3} gap={3}>
            <ContentCardHeader
              title={
                <TextTitle3 color="fg" style={{ margin: 0 }}>
                  {t("capabilityOutcome.pageTitle")}
                </TextTitle3>
              }
              subtitle={
                <TextCaption color="fgMuted" style={{ margin: 0, lineHeight: 1.5 }}>
                  {t("capabilityOutcome.pageSubtitle")}
                </TextCaption>
              }
            />
            <ContentCardBody>
              <VStack gap={3} alignItems="stretch">
                <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("capabilityOutcome.bookmarkHint")}
                </TextCaption>
                <Button
                  variant="secondary"
                  type="button"
                  compact
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      typeof window !== "undefined"
                        ? `${window.location.origin}${selfHref}`
                        : selfHref,
                    )
                  }
                  style={{ borderRadius: "100px", alignSelf: "flex-start" }}
                >
                  {t("capabilityOutcome.copyLink")}
                </Button>

                {loadError ? (
                  <TextBody color="fgNegative">{loadError}</TextBody>
                ) : null}

                {outcome ? (
                  <Box bordered borderRadius={400} background="bg" padding={3}>
                    <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                      {t("capabilityOutcome.sectionOutcome")}
                    </TextCaption>
                    <DetailRow
                      label={t("capabilityOutcome.labelStatusMessage")}
                      value={outcome.result_status_message}
                    />
                    <DetailRow
                      label={t("capabilityOutcome.labelStatusCode")}
                      value={outcome.result_status_code}
                    />
                    <DetailRow
                      label={t("capabilityOutcome.labelDelivery")}
                      value={outcome.delivery_mode}
                    />
                    <DetailRow
                      label={t("capabilityOutcome.labelExecution")}
                      value={outcome.execution_status}
                    />
                    <DetailRow
                      label={t("capabilityOutcome.labelLifecycle")}
                      value={String(outcome.result_lifecycle)}
                    />
                    {outcome.poll_url ? (
                      <DetailRow
                        label={t("capabilityOutcome.labelPoll")}
                        value={outcome.poll_url}
                      />
                    ) : null}
                    {outcome.retrieval_url ? (
                      <DetailRow
                        label={t("capabilityOutcome.labelRetrieval")}
                        value={outcome.retrieval_url}
                      />
                    ) : null}
                  </Box>
                ) : paid?.data?.ok === true && !loadError ? (
                  <TextCaption color="fgMuted">
                    {t("capabilityOutcome.noOutcomeBlock")}
                  </TextCaption>
                ) : null}

                {fulfillment === "protected" && proxyUrl ? (
                  <Box bordered borderRadius={400} background="bgPositiveWash" padding={3}>
                    <TextBody color="fg" as="p" style={{ margin: "0 0 10px" }}>
                      {t("capabilityOutcome.protectedCta")}
                    </TextBody>
                    <Button
                      variant="primary"
                      as="a"
                      href={proxyUrl}
                      target="_blank"
                      rel="noreferrer"
                      block
                    >
                      {t("capabilityOutcome.openProxy")}
                    </Button>
                  </Box>
                ) : null}

                {fulfillment === "async" && jobDetailHref ? (
                  <VStack gap={2} alignItems="stretch">
                    <Box bordered borderRadius={400} background="bg" padding={3}>
                      <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                        {t("capabilityOutcome.asyncLiveTitle")}
                      </TextCaption>
                      {job?.ok ? (
                        <>
                          <DetailRow
                            label={t("capabilityOutcome.labelJobStatus")}
                            value={String(job.status ?? "—")}
                          />
                          <DetailRow
                            label={t("capabilityOutcome.labelJobUpdated")}
                            value={formatTs(job.updated_at ?? null, "—")}
                          />
                          {job.buyer?.result_status_message ? (
                            <DetailRow
                              label={t("capabilityOutcome.labelPollMessage")}
                              value={job.buyer.result_status_message}
                            />
                          ) : null}
                        </>
                      ) : (
                        <TextCaption color="fgMuted">
                          {t("capabilityOutcome.jobPollWaiting")}
                        </TextCaption>
                      )}
                    </Box>
                    <Button as={Link} to={jobDetailHref} variant="primary" block>
                      {t("capabilityOutcome.openJobDetail")}
                    </Button>
                  </VStack>
                ) : null}

                {receiptJson ? (
                  <Box bordered borderRadius={400} background="bg" padding={3}>
                    <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                      {t("capabilityOutcome.receiptTitle")}
                    </TextCaption>
                    <Button
                      variant="secondary"
                      compact
                      type="button"
                      onClick={() => setShowTechnical((v) => !v)}
                    >
                      {showTechnical
                        ? t("capabilityOutcome.hideReceipt")
                        : t("capabilityOutcome.showReceipt")}
                    </Button>
                    {showTechnical ? (
                      <Box
                        as="pre"
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 12,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {receiptJson.length > 12000
                          ? `${receiptJson.slice(0, 12000)}\n…`
                          : receiptJson}
                      </Box>
                    ) : null}
                  </Box>
                ) : null}
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
