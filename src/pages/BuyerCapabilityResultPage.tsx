import { useEffect, useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
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

export default function BuyerCapabilityResultPage() {
  const { t } = useTranslation()
  const { slug: slugParam, jobId: jobIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const slug = slugParam?.trim() ?? ""
  const jobId = jobIdParam?.trim() ?? ""
  const attemptId = searchParams.get("attemptId")?.trim() || null

  const [job, setJob] = useState<CapabilityJobPollResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [receiptJson, setReceiptJson] = useState<string | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [showTechnical, setShowTechnical] = useState(false)

  const selfHref = useMemo(
    () => buyerCapabilityResultPath(slug, jobId, attemptId),
    [slug, jobId, attemptId],
  )

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      const j = await fetchCapabilityJob(jobId)
      if (cancelled) return
      if (!j.ok) {
        setLoadError(j.error ?? t("capabilityResult.pollFailed"))
        return
      }
      setLoadError(null)
      setJob(j)
      const terminal = j.status === "completed" || j.status === "failed"
      if (terminal && timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
    timer = window.setInterval(() => void poll(), POLL_MS)
    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [jobId, t])

  useEffect(() => {
    if (!attemptId || !slug) {
      setReceiptJson(null)
      setReceiptError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { response, data } = await fetchPaidX402Resource(slug, attemptId)
      if (cancelled) return
      if (
        response.ok &&
        data?.ok === true &&
        data.status === "paid" &&
        data.capabilityReceipt &&
        typeof data.capabilityReceipt === "object" &&
        !Array.isArray(data.capabilityReceipt)
      ) {
        setReceiptJson(JSON.stringify(data.capabilityReceipt, null, 2))
        setReceiptError(null)
        return
      }
      setReceiptJson(null)
      setReceiptError(
        data?.error?.trim() ||
          t("capabilityResult.receiptUnavailable", { status: response.status }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId, slug, t])

  const lifecycleKey = job?.buyer?.result_lifecycle ?? "unknown"
  const lifecycleLabel = t(`capabilityResult.lifecycle.${lifecycleKey}`, {
    defaultValue: lifecycleKey,
  })
  const retentionState = job?.buyer?.retention_state ?? job?.result?.retention_state
  const retentionLabel = t(
    `capabilityResult.retention.${(retentionState ?? "unknown").toLowerCase()}`,
    { defaultValue: retentionState ?? "—" },
  )

  const executionLabel = t(
    `capabilityResult.execution.${(job?.status ?? "unknown").toLowerCase()}`,
    { defaultValue: job?.status ?? "—" },
  )

  const expiresAt = job?.buyer?.expires_at ?? job?.result?.expires_at ?? null
  const retrievalUrl = job?.buyer?.retrieval_url ?? job?.result?.retrieval_url ?? null
  const canRetrieve =
    lifecycleKey === "result_available" &&
    typeof retrievalUrl === "string" &&
    retrievalUrl.trim() !== ""

  const previewText = job?.result_preview?.trim()
    ? job.result_preview
    : null

  const slugMismatch =
    job?.slug && slug && job.slug.toLowerCase() !== slug.toLowerCase()

  if (!slug || !jobId) {
    return (
      <Box as="main" padding={4} background="bg" color="fg">
        <TextBody color="fgMuted">{t("capabilityResult.missingRoute")}</TextBody>
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
                ← {t("capabilityResult.backToUnlock")}
              </TextCaption>
            </Link>
            {attemptId ? (
              <Link
                to={`/success/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`}
                style={{ textDecoration: "none" }}
              >
                <TextCaption color="fgMuted" as="span">
                  {t("capabilityResult.linkSuccess")}
                </TextCaption>
              </Link>
            ) : null}
            {attemptId ? (
              <Link
                to={buyerCapabilityOutcomePath(slug, attemptId)}
                style={{ textDecoration: "none" }}
              >
                <TextCaption color="fgMuted" as="span">
                  {t("capabilityResult.linkUnifiedOutcome")}
                </TextCaption>
              </Link>
            ) : null}
          </VStack>

          <ContentCard width="100%" bordered background="bgSecondary" padding={3} gap={3}>
            <ContentCardHeader
              title={
                <TextTitle3 color="fg" style={{ margin: 0 }}>
                  {t("capabilityResult.pageTitle")}
                </TextTitle3>
              }
              subtitle={
                <TextCaption color="fgMuted" style={{ margin: 0, lineHeight: 1.5 }}>
                  {t("capabilityResult.pageSubtitle")}
                </TextCaption>
              }
            />
            <ContentCardBody>
              <VStack gap={3} alignItems="stretch">
                <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("capabilityResult.bookmarkHint")}
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
                  {t("capabilityResult.copyPageLink")}
                </Button>

                {slugMismatch ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgWarningWash"
                    padding={3}
                  >
                    <TextBody color="fg" as="p" style={{ margin: 0 }}>
                      {t("capabilityResult.slugMismatch", {
                        routeSlug: slug,
                        jobSlug: job?.slug ?? "",
                      })}
                    </TextBody>
                  </Box>
                ) : null}

                {loadError ? <TextBody color="fgNegative">{loadError}</TextBody> : null}

                {job?.capability ? (
                  <Box bordered borderRadius={400} background="bg" padding={3}>
                    <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                      {t("capabilityResult.sectionCapability")}
                    </TextCaption>
                    <DetailRow
                      label={t("capabilityResult.labelName")}
                      value={
                        job.capability.capability_name?.trim() ||
                        job.capability.slug ||
                        "—"
                      }
                    />
                    <DetailRow label={t("capabilityResult.labelSlug")} value={job.slug ?? slug} />
                    <DetailRow
                      label={t("capabilityResult.labelDelivery")}
                      value={String(job.capability.delivery_mode ?? "—")}
                    />
                  </Box>
                ) : null}

                <Box bordered borderRadius={400} background="bg" padding={3}>
                  <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                    {t("capabilityResult.sectionExecution")}
                  </TextCaption>
                  <DetailRow label={t("capabilityResult.labelJobId")} value={jobId} />
                  <DetailRow
                    label={t("capabilityResult.labelExecution")}
                    value={executionLabel}
                  />
                  {typeof job?.attempt_count === "number" &&
                  typeof job?.max_attempts === "number" ? (
                    <DetailRow
                      label={t("capabilityResult.labelAttempts")}
                      value={`${job.attempt_count} / ${job.max_attempts}`}
                    />
                  ) : null}
                  {job?.will_retry ? (
                    <TextCaption color="fgMuted" style={{ margin: "8px 0 0" }}>
                      {t("capabilityResult.retryScheduledLine", {
                        at: formatTs(job.next_retry_at ?? null, "—"),
                      })}
                    </TextCaption>
                  ) : null}
                  {job?.status === "failed" ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: "10px 0 0" }}>
                      {job.last_error_summary?.trim()
                        ? job.last_error_summary
                        : t("capabilityResult.failedGeneric")}
                    </TextBody>
                  ) : null}
                </Box>

                <Box bordered borderRadius={400} background="bg" padding={3}>
                  <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                    {t("capabilityResult.sectionResult")}
                  </TextCaption>
                  <DetailRow
                    label={t("capabilityResult.labelResultLifecycle")}
                    value={lifecycleLabel}
                  />
                  <DetailRow
                    label={t("capabilityResult.labelRetention")}
                    value={retentionLabel}
                  />
                  {expiresAt ? (
                    <DetailRow
                      label={t("capabilityResult.labelExpires")}
                      value={formatTs(expiresAt, "—")}
                    />
                  ) : null}
                  {lifecycleKey === "result_expired" ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: "10px 0 0" }}>
                      {t("capabilityResult.expiredExplain")}
                    </TextBody>
                  ) : null}
                  {lifecycleKey === "result_deleted" ? (
                    <TextBody color="fgNegative" as="p" style={{ margin: "10px 0 0" }}>
                      {t("capabilityResult.deletedExplain")}
                    </TextBody>
                  ) : null}
                  {lifecycleKey === "result_not_stored" &&
                  job?.status === "completed" ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: "10px 0 0" }}>
                      {t("capabilityResult.notStoredExplain")}
                    </TextBody>
                  ) : null}
                  {lifecycleKey === "result_preview_only" ? (
                    <TextBody color="fgMuted" as="p" style={{ margin: "10px 0 0" }}>
                      {t("capabilityResult.previewOnlyExplain")}
                    </TextBody>
                  ) : null}
                  {previewText &&
                  (job?.result?.preview_available ||
                    job?.buyer?.preview_available) ? (
                    <Box style={{ marginTop: 10 }}>
                      <TextCaption color="fgMuted" style={{ margin: "0 0 6px" }}>
                        {t("capabilityResult.previewBlockTitle")}
                      </TextCaption>
                      <Box
                        as="pre"
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 13,
                          lineHeight: 1.45,
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {previewText.length > 8000
                          ? `${previewText.slice(0, 8000)}…`
                          : previewText}
                      </Box>
                    </Box>
                  ) : null}
                  {canRetrieve && retrievalUrl ? (
                    <Button
                      as="a"
                      href={retrievalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="primary"
                      block
                      height="auto"
                      minHeight={44}
                      style={{ marginTop: 12 }}
                    >
                      {t("capabilityResult.retrieveCta")}
                    </Button>
                  ) : null}
                  {job?.status === "completed" &&
                  !canRetrieve &&
                  lifecycleKey !== "result_expired" &&
                  lifecycleKey !== "result_deleted" &&
                  lifecycleKey !== "execution_failed" ? (
                    <TextCaption color="fgMuted" style={{ marginTop: 8 }}>
                      {t("capabilityResult.noRetrieval")}
                    </TextCaption>
                  ) : null}
                </Box>

                {attemptId ? (
                  <Box bordered borderRadius={400} background="bg" padding={3}>
                    <TextCaption color="fgMuted" style={{ margin: "0 0 8px" }}>
                      {t("capabilityResult.sectionReceipt")}
                    </TextCaption>
                    {receiptError && !receiptJson ? (
                      <TextCaption color="fgMuted">{receiptError}</TextCaption>
                    ) : null}
                    {receiptJson ? (
                      <>
                        <Button
                          variant="secondary"
                          type="button"
                          compact
                          onClick={() => setShowTechnical((s) => !s)}
                          style={{ borderRadius: "100px", marginBottom: 8 }}
                        >
                          {showTechnical
                            ? t("capabilityResult.hideReceipt")
                            : t("capabilityResult.showReceipt")}
                        </Button>
                        {showTechnical ? (
                          <Box
                            as="pre"
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontSize: 12,
                              lineHeight: 1.45,
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            }}
                          >
                            {receiptJson}
                          </Box>
                        ) : null}
                      </>
                    ) : null}
                  </Box>
                ) : (
                  <TextCaption color="fgMuted" style={{ margin: 0 }}>
                    {t("capabilityResult.receiptNeedAttempt")}
                  </TextCaption>
                )}
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
