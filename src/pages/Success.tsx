import { useEffect, useMemo, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"
import {
  fetchCapabilityJob,
  fetchPaidX402Resource,
  fetchPaymentAttempt,
  type CapabilityJobPollResponse,
  type PaymentAttemptPayload,
  type PaymentAttemptStatus,
} from "@/lib/api"
import {
  buyerCapabilityOutcomePath,
  buyerCapabilityResultPath,
  unlockPagePath,
} from "@/lib/appUrl"
import {
  openPaidResource,
  resolvePaidNavigateUrl,
} from "@/lib/paidResourceUnlock"
import i18n from "@/i18n/config"
import { LegacyCheckoutSessionPanel } from "@/legacy/LegacyCheckoutSessionPanel"
import type { TFunction } from "i18next"

const pagePaddingX = { base: 2, desktop: 4 } as const
const pagePaddingY = { base: 3, desktop: 6 } as const
const cardPadding = { base: 3, desktop: 4 } as const
const cardGap = { base: 3, desktop: 4 } as const
const sectionGap = { base: 3, desktop: 4 } as const

const POLL_MS = 2500

const TERMINAL_ATTEMPT: Set<string> = new Set([
  "paid",
  "failed",
  "expired",
  "cancelled",
])

function formatTs(value: string | null) {
  if (!value) return i18n.t("common.emDash")
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

function attemptHeadline(status: string, t: TFunction): string {
  switch (status as PaymentAttemptStatus) {
    case "paid":
      return t("success.headline.paid")
    case "payment_required":
    case "pending":
    case "created":
      return t("success.headline.waiting")
    case "failed":
      return t("success.headline.failed")
    case "expired":
      return t("success.headline.expired")
    case "cancelled":
      return t("success.headline.cancelled")
    default:
      return t("success.headline.default")
  }
}

function attemptSubtitle(status: string, t: TFunction): string {
  switch (status as PaymentAttemptStatus) {
    case "paid":
      return t("success.subtitle.paid")
    case "payment_required":
      return t("success.subtitle.payment_required")
    case "pending":
      return t("success.subtitle.pending")
    case "failed":
      return t("success.subtitle.failed")
    case "expired":
      return t("success.subtitle.expired")
    case "cancelled":
      return t("success.subtitle.cancelled")
    case "created":
      return t("success.subtitle.created")
    default:
      return t("success.subtitle.default")
  }
}

function statusPillLabel(status: string, t: TFunction): string {
  if (status === "payment_required") return t("success.pill.payment_required")
  return status.replace(/_/g, " ")
}

function readJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function retentionStateLabel(state: string | undefined, t: TFunction): string {
  const s = state?.trim().toLowerCase() ?? ""
  switch (s) {
    case "available":
      return t("success.retention.available")
    case "expired":
      return t("success.retention.expired")
    case "deleted":
      return t("success.retention.deleted")
    case "preview_only":
      return t("success.retention.previewOnly")
    case "not_stored":
      return t("success.retention.notStored")
    default:
      return s !== "" ? state ?? "—" : "—"
  }
}

function readCapabilityProxyUrl(value: unknown): string | null {
  const o = readJsonRecord(value)
  const u = o?.proxy_url
  return typeof u === "string" && /^https?:\/\//i.test(u.trim())
    ? u.trim()
    : null
}

function NavButtons({ payHref }: { payHref: string }) {
  const { t } = useTranslation()
  return (
    <VStack gap={2} width="100%" alignItems="stretch">
      <Button as={Link} to="/" block height="auto" minHeight={44}>
        {t("success.navHome")}
      </Button>
      <Button
        as={Link}
        to={payHref}
        variant="secondary"
        block
        height="auto"
        minHeight={44}
      >
        {t("success.navBackToPay")}
      </Button>
    </VStack>
  )
}

export default function Success() {
  const { t } = useTranslation()
  const { slug: routeSlug } = useParams()
  const [searchParams] = useSearchParams()
  const attemptId = searchParams.get("attemptId")?.trim() || null
  const sessionId = searchParams.get("sessionId")?.trim() || null

  const [attempt, setAttempt] = useState<PaymentAttemptPayload | null>(null)
  const [attemptError, setAttemptError] = useState<string | null>(null)
  const [attemptInitialLoad, setAttemptInitialLoad] = useState(true)

  const [paidPayload, setPaidPayload] = useState<{
    type: string
    value: unknown
  } | null>(null)
  const [capabilityReceipt, setCapabilityReceipt] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [paidPayloadLoading, setPaidPayloadLoading] = useState(false)
  const [paidPayloadError, setPaidPayloadError] = useState<string | null>(null)
  const [asyncJobPoll, setAsyncJobPoll] =
    useState<CapabilityJobPollResponse | null>(null)
  const [showCapabilityTechnical, setShowCapabilityTechnical] =
    useState(false)

  useEffect(() => {
    if (!attemptId) return

    setAttempt(null)
    setAttemptError(null)
    setAttemptInitialLoad(true)

    let cancelled = false
    let timer: number | undefined
    let first = true

    const load = async () => {
      try {
        const data = await fetchPaymentAttempt(attemptId)
        if (cancelled) return
        if (!data.ok || !data.attempt) {
          setAttemptError(data.error || t("success.loadAttemptError"))
          return
        }
        setAttemptError(null)
        setAttempt(data.attempt)
        if (TERMINAL_ATTEMPT.has(data.attempt.status) && timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      } catch {
        if (!cancelled) {
          setAttemptError(t("success.loadAttemptError"))
        }
      } finally {
        if (first) {
          first = false
          if (!cancelled) setAttemptInitialLoad(false)
        }
      }
    }

    timer = window.setInterval(load, POLL_MS)
    void load()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [attemptId, t])

  useEffect(() => {
    if (!attemptId || !attempt || attempt.status !== "paid") {
      setPaidPayload(null)
      setCapabilityReceipt(null)
      setPaidPayloadError(null)
      setPaidPayloadLoading(false)
      return
    }

    let cancelled = false
    setPaidPayload(null)
    setCapabilityReceipt(null)
    setPaidPayloadError(null)
    setPaidPayloadLoading(true)

    const slug = attempt.slug
    ;(async () => {
      const { response, data } = await fetchPaidX402Resource(slug, attemptId)
      if (cancelled) return
      setPaidPayloadLoading(false)
      if (
        response.ok &&
        data?.ok === true &&
        data.status === "paid" &&
        data.resource
      ) {
        setPaidPayload({
          type: data.resource.type,
          value: data.resource.value,
        })
        setCapabilityReceipt(
          data.capabilityReceipt &&
            typeof data.capabilityReceipt === "object" &&
            !Array.isArray(data.capabilityReceipt)
            ? (data.capabilityReceipt as Record<string, unknown>)
            : null,
        )
        return
      }
      setPaidPayload(null)
      setCapabilityReceipt(null)
      setPaidPayloadError(
        data?.error?.trim() ||
          t("success.loadPaidResourceFailed", { status: response.status }),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [attemptId, attempt, t])

  const asyncJobId = useMemo(() => {
    if (!paidPayload || paidPayload.type.toLowerCase() !== "json") {
      return null
    }
    const v = readJsonRecord(paidPayload.value)
    const id = v?.async_job_id
    return typeof id === "string" && id.trim() !== "" ? id.trim() : null
  }, [paidPayload])

  const capabilityResultHref = useMemo(() => {
    if (!asyncJobId || !attempt?.slug) return null
    return buyerCapabilityResultPath(attempt.slug, asyncJobId, attemptId)
  }, [asyncJobId, attempt?.slug, attemptId])

  useEffect(() => {
    if (!asyncJobId) {
      setAsyncJobPoll(null)
      return
    }
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      const j = await fetchCapabilityJob(asyncJobId)
      if (cancelled) return
      setAsyncJobPoll(j)
      const st = j.status
      if (st === "completed" || st === "failed") {
        if (timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      }
    }
    timer = window.setInterval(tick, POLL_MS)
    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [asyncJobId])

  const successNavigableUrl = useMemo(() => {
    if (!paidPayload) return null
    return resolvePaidNavigateUrl(paidPayload.type, paidPayload.value)
  }, [paidPayload])

  const paidCapabilityKind = useMemo(() => {
    if (!paidPayload || paidPayload.type.toLowerCase() !== "json") return null
    const v = paidPayload.value
    if (v === null || typeof v !== "object") return null
    const k = (v as Record<string, unknown>).kind
    return typeof k === "string" && k.startsWith("capability_") ? k : null
  }, [paidPayload])

  const capabilityOutcomeHref = useMemo(() => {
    if (!attempt?.slug || !attemptId || !paidCapabilityKind) return null
    return buyerCapabilityOutcomePath(attempt.slug, attemptId)
  }, [attempt?.slug, attemptId, paidCapabilityKind])

  const successPaidDisplayJson = useMemo(() => {
    if (!paidPayload) return ""
    const raw =
      paidPayload.type.toLowerCase() === "json" &&
      paidPayload.value !== null &&
      typeof paidPayload.value === "object"
        ? paidPayload.value
        : paidPayload.value
    return JSON.stringify(raw, null, 2)
  }, [paidPayload])

  useEffect(() => {
    if (!successNavigableUrl || attempt?.status !== "paid") return
    const id = window.setTimeout(() => {
      window.location.assign(successNavigableUrl)
    }, 500)
    return () => window.clearTimeout(id)
  }, [successNavigableUrl, attempt?.status])

  const slugMismatch = useMemo(() => {
    if (!routeSlug || !attempt) return false
    return attempt.slug !== routeSlug
  }, [routeSlug, attempt])

  const payHref = useMemo(() => {
    const s = attempt?.slug ?? routeSlug
    if (s && s !== "") return unlockPagePath(s)
    return "/"
  }, [attempt?.slug, routeSlug])

  // --- Primary: x402 attempt (authoritative) ---
  if (attemptId) {
    const headline = (() => {
      if (attemptError && !attempt) return t("success.headline.unavailable")
      if (!attempt && attemptInitialLoad) return t("success.headline.waiting")
      if (!attempt) return t("success.headline.unavailable")
      return attemptHeadline(attempt.status, t)
    })()
    const subtitle = (() => {
      if (attemptError && !attempt) return attemptError
      if (!attempt && attemptInitialLoad) return t("success.subtitle.checking")
      if (!attempt) return t("success.subtitle.errorNoAttempt")
      return attemptSubtitle(attempt.status, t)
    })()

    const paid = attempt?.status === "paid"
    const headerBg = paid ? "bgPositiveWash" : "bgSecondary"

    return (
      <Box
        as="main"
        width="100%"
        display="flex"
        alignItems="center"
        justifyContent="center"
        background="bg"
        color="fg"
        style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
      >
        <Box
          width="100%"
          maxWidth="28rem"
          paddingX={pagePaddingX}
          paddingY={pagePaddingY}
        >
          <VStack gap={2} alignItems="stretch">
            <ContentCard
              width="100%"
              bordered
              background={headerBg}
              padding={cardPadding}
              gap={cardGap}
            >
              <ContentCardHeader
                title={<TextTitle3 color="fg">{headline}</TextTitle3>}
                subtitle={
                  <TextBody color="fgMuted" textAlign="center">
                    {subtitle}
                  </TextBody>
                }
              />
              <ContentCardBody>
                <VStack gap={sectionGap} alignItems="stretch">
                  {attemptError && !attempt ? (
                    <Box
                      bordered
                      borderRadius={400}
                      background="bgNegativeWash"
                      padding={3}
                    >
                      <TextBody color="fgNegative">{attemptError}</TextBody>
                    </Box>
                  ) : null}

                  {attempt ? (
                    <>
                      {slugMismatch ? (
                        <Box
                          bordered
                          borderRadius={400}
                          background="bgWarningWash"
                          padding={3}
                        >
                          <TextBody color="fg">
                            <Trans
                              i18nKey="success.slugMismatch"
                              values={{
                                routeSlug: routeSlug ?? "",
                                attemptSlug: attempt.slug,
                              }}
                              components={{
                                slug1: (
                                  <TextBody as="span" fontWeight="label1" />
                                ),
                                slug2: (
                                  <TextBody as="span" fontWeight="label1" />
                                ),
                              }}
                            />
                          </TextBody>
                        </Box>
                      ) : null}
                      <Box
                        bordered
                        borderRadius={400}
                        background="bgSecondary"
                        padding={{ base: 3, desktop: 4 }}
                      >
                        <VStack gap={2} alignItems="stretch">
                          <DetailRow
                            label={t("success.detailStatus")}
                            value={statusPillLabel(attempt.status, t)}
                          />
                          <DetailRow
                            label={t("success.detailLabel")}
                            value={attempt.label}
                          />
                          <DetailRow
                            label={t("success.detailAmount")}
                            value={`${attempt.amount} ${attempt.currency}`}
                          />
                          <DetailRow
                            label={t("success.detailNetwork")}
                            value={attempt.network}
                          />
                          <DetailRow
                            label={t("success.detailSlug")}
                            value={attempt.slug}
                          />
                          <DetailRow
                            label={t("success.detailAttemptId")}
                            value={attempt.id}
                          />
                          <DetailRow
                            label={t("success.detailPaidAt")}
                            value={formatTs(attempt.paidAt)}
                          />
                          <DetailRow
                            label={t("success.detailUpdated")}
                            value={formatTs(attempt.updatedAt)}
                          />
                        </VStack>
                      </Box>
                    </>
                  ) : attemptInitialLoad && !attemptError ? (
                    <TextBody color="fgMuted">
                      {t("success.loadingAttempt")}
                    </TextBody>
                  ) : null}

                  {paid ? (
                    <VStack gap={2} alignItems="stretch">
                      {paidPayloadLoading ? (
                        <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                          {t("success.loadingPaidResource")}
                        </TextBody>
                      ) : null}
                      {paidPayloadError && !paidPayloadLoading ? (
                        <Box
                          bordered
                          borderRadius={400}
                          background="bgNegativeWash"
                          padding={3}
                        >
                          <TextBody color="fgNegative">
                            {paidPayloadError}
                          </TextBody>
                        </Box>
                      ) : null}
                      {paidPayload && !paidPayloadLoading ? (
                        <VStack gap={2} alignItems="stretch">
                          {paidCapabilityKind ? (
                            <>
                              <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
                                {paidCapabilityKind === "capability_async"
                                  ? t("success.capability.headlineAsync")
                                  : paidCapabilityKind === "capability_protected"
                                    ? t("success.capability.headlineProtected")
                                    : t("success.capability.headlineDirect")}
                              </TextTitle3>
                              <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                                {paidCapabilityKind === "capability_async"
                                  ? t("success.capability.subtitleAsync")
                                  : paidCapabilityKind === "capability_protected"
                                    ? t("success.capability.subtitleProtected")
                                    : t("success.capability.subtitleDirect")}
                              </TextBody>

                              {capabilityReceipt ? (
                                <Box
                                  bordered
                                  borderRadius={400}
                                  background="bgSecondary"
                                  padding={3}
                                >
                                  <VStack gap={2} alignItems="stretch">
                                    <TextCaption
                                      color="fgMuted"
                                      style={{ margin: 0 }}
                                    >
                                      {t("success.capability.receiptSection")}
                                    </TextCaption>
                                    {typeof capabilityReceipt.capability_name ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.receiptName")}
                                        value={capabilityReceipt.capability_name}
                                      />
                                    ) : null}
                                    {typeof capabilityReceipt.execution_status ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.receiptExecution")}
                                        value={capabilityReceipt.execution_status}
                                      />
                                    ) : null}
                                    {typeof capabilityReceipt.delivery_mode ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.receiptDelivery")}
                                        value={capabilityReceipt.delivery_mode}
                                      />
                                    ) : null}
                                    {typeof capabilityReceipt.origin_trust_status ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.receiptTrust")}
                                        value={capabilityReceipt.origin_trust_status}
                                      />
                                    ) : null}
                                  </VStack>
                                </Box>
                              ) : null}

                              {capabilityOutcomeHref ? (
                                <VStack gap={2} alignItems="stretch">
                                  <TextCaption
                                    color="fgMuted"
                                    as="p"
                                    style={{ margin: 0, lineHeight: 1.5 }}
                                  >
                                    {t("success.capability.unifiedOutcomeHint")}
                                  </TextCaption>
                                  <Button
                                    as={Link}
                                    to={capabilityOutcomeHref}
                                    variant="primary"
                                    block
                                    height="auto"
                                    minHeight={44}
                                  >
                                    {t("success.capability.openUnifiedOutcome")}
                                  </Button>
                                </VStack>
                              ) : null}

                              {paidCapabilityKind === "capability_protected" &&
                              readCapabilityProxyUrl(paidPayload.value) ? (
                                <Button
                                  as="a"
                                  href={readCapabilityProxyUrl(paidPayload.value)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  variant="primary"
                                  block
                                  height="auto"
                                  minHeight={44}
                                >
                                  {t("success.capability.proxyCta")}
                                </Button>
                              ) : null}

                              {paidCapabilityKind === "capability_direct" ? (
                                (() => {
                                  const capVal = readJsonRecord(paidPayload.value)
                                  const execRaw = capVal?.execution
                                  const exec =
                                    execRaw &&
                                    typeof execRaw === "object" &&
                                    !Array.isArray(execRaw)
                                      ? (execRaw as Record<string, unknown>)
                                      : null
                                  if (!exec) return null
                                  const httpStatus = exec.http_status
                                  const fetchErr = exec.fetch_error
                                  const body =
                                    typeof exec.body === "string"
                                      ? exec.body
                                      : null
                                  const preview =
                                    typeof exec.body_preview === "string"
                                      ? exec.body_preview
                                      : null
                                  return (
                                    <Box
                                      bordered
                                      borderRadius={400}
                                      background="bgSecondary"
                                      padding={3}
                                    >
                                      <VStack gap={2} alignItems="stretch">
                                        <TextCaption
                                          color="fgMuted"
                                          style={{ margin: 0 }}
                                        >
                                          {t("success.capability.directResult")}
                                        </TextCaption>
                                        {typeof httpStatus === "number" ? (
                                          <DetailRow
                                            label={t(
                                              "success.capability.httpStatus",
                                            )}
                                            value={String(httpStatus)}
                                          />
                                        ) : null}
                                        {fetchErr != null &&
                                        String(fetchErr).trim() !== "" ? (
                                          <DetailRow
                                            label={t(
                                              "success.capability.fetchError",
                                            )}
                                            value={String(fetchErr)}
                                          />
                                        ) : null}
                                        {body != null && body.length > 0 ? (
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
                                            {body.length > 4000
                                              ? `${body.slice(0, 4000)}…`
                                              : body}
                                          </Box>
                                        ) : null}
                                        {preview != null && preview.length > 0 ? (
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
                                            {preview}
                                          </Box>
                                        ) : null}
                                      </VStack>
                                    </Box>
                                  )
                                })()
                              ) : null}

                              {paidCapabilityKind === "capability_async" &&
                              asyncJobId ? (
                                <Box
                                  bordered
                                  borderRadius={400}
                                  background="bgWarningWash"
                                  padding={3}
                                >
                                  <VStack gap={2} alignItems="stretch">
                                    {asyncJobPoll?.capability?.capability_name ||
                                    asyncJobPoll?.capability?.slug ? (
                                      <DetailRow
                                        label={t("success.capability.purchasedLabel")}
                                        value={
                                          asyncJobPoll?.capability?.capability_name?.trim() ||
                                          asyncJobPoll?.capability?.slug ||
                                          ""
                                        }
                                      />
                                    ) : null}
                                    {typeof asyncJobPoll?.capability?.delivery_mode ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.deliveryModeLabel")}
                                        value={asyncJobPoll.capability.delivery_mode}
                                      />
                                    ) : null}
                                    <TextBody color="fg" as="p" style={{ margin: 0 }}>
                                      {t("success.capability.asyncExplain")}
                                    </TextBody>
                                    {capabilityResultHref ? (
                                      <>
                                        <TextCaption
                                          color="fgMuted"
                                          as="p"
                                          style={{ margin: 0, lineHeight: 1.5 }}
                                        >
                                          {t("success.capability.resultPageHint")}
                                        </TextCaption>
                                        <Button
                                          as={Link}
                                          to={capabilityResultHref}
                                          variant="secondary"
                                          block
                                          height="auto"
                                          minHeight={44}
                                        >
                                          {t("success.capability.openResultPage")}
                                        </Button>
                                      </>
                                    ) : null}
                                    <DetailRow
                                      label={t("success.capability.jobId")}
                                      value={asyncJobId}
                                    />
                                    <DetailRow
                                      label={t("success.capability.jobStatus")}
                                      value={
                                        asyncJobPoll?.ok &&
                                        typeof asyncJobPoll.status === "string"
                                          ? asyncJobPoll.status
                                          : "…"
                                      }
                                    />
                                    {typeof asyncJobPoll?.buyer?.result_lifecycle ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.outcomeLabel")}
                                        value={t(
                                          `capabilityResult.lifecycle.${asyncJobPoll.buyer.result_lifecycle}`,
                                          {
                                            defaultValue:
                                              asyncJobPoll.buyer.result_lifecycle,
                                          },
                                        )}
                                      />
                                    ) : null}
                                    {typeof asyncJobPoll?.max_attempts ===
                                      "number" ? (
                                      <DetailRow
                                        label={t("success.capability.attemptsLabel")}
                                        value={`${asyncJobPoll.attempt_count ?? 0} / ${asyncJobPoll.max_attempts}`}
                                      />
                                    ) : null}
                                    {asyncJobPoll?.will_retry ? (
                                      <TextCaption color="fgMuted" style={{ margin: 0 }}>
                                        {t("success.capability.retryScheduled")}
                                        {typeof asyncJobPoll.next_retry_at ===
                                          "string" &&
                                        asyncJobPoll.next_retry_at.trim() !== ""
                                          ? ` (${formatTs(asyncJobPoll.next_retry_at)})`
                                          : ""}
                                      </TextCaption>
                                    ) : null}
                                    {typeof asyncJobPoll?.result?.retention_state ===
                                    "string" ? (
                                      <DetailRow
                                        label={t("success.capability.retentionStateLabel")}
                                        value={retentionStateLabel(
                                          asyncJobPoll.result.retention_state,
                                          t,
                                        )}
                                      />
                                    ) : null}
                                    {asyncJobPoll?.status === "failed" ? (
                                      <TextBody
                                        color="fgNegative"
                                        as="p"
                                        style={{ margin: 0 }}
                                      >
                                        {typeof asyncJobPoll.last_error_summary ===
                                          "string" &&
                                        asyncJobPoll.last_error_summary.trim() !==
                                          ""
                                          ? asyncJobPoll.last_error_summary
                                          : t("success.capability.jobFailedGeneric")}
                                      </TextBody>
                                    ) : null}
                                    {asyncJobPoll?.status === "completed" &&
                                    asyncJobPoll.result?.retention_state === "expired" ? (
                                      <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
                                        {t("success.capability.resultExpired")}
                                      </TextBody>
                                    ) : null}
                                    {asyncJobPoll?.status === "completed" &&
                                    asyncJobPoll.result?.retention_state === "deleted" ? (
                                      <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
                                        {t("success.capability.resultDeleted")}
                                      </TextBody>
                                    ) : null}
                                    {asyncJobPoll?.status === "completed" &&
                                    typeof asyncJobPoll.result_preview ===
                                      "string" &&
                                    asyncJobPoll.result_preview.trim() !== "" ? (
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
                                        {asyncJobPoll.result_preview}
                                      </Box>
                                    ) : null}
                                    {(() => {
                                      const lc =
                                        asyncJobPoll?.buyer?.result_lifecycle
                                      const can =
                                        lc === "result_available" ||
                                        (!lc &&
                                          asyncJobPoll?.status === "completed" &&
                                          asyncJobPoll.result
                                            ?.full_result_available &&
                                          typeof asyncJobPoll.result
                                            .retrieval_url === "string" &&
                                          asyncJobPoll.result.retrieval_url.trim() !==
                                            "")
                                      const href =
                                        asyncJobPoll?.buyer?.retrieval_url ??
                                        asyncJobPoll?.result?.retrieval_url
                                      if (
                                        !can ||
                                        typeof href !== "string" ||
                                        href.trim() === ""
                                      ) {
                                        return null
                                      }
                                      return (
                                        <Button
                                          as="a"
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          variant="secondary"
                                          block
                                          height="auto"
                                          minHeight={44}
                                        >
                                          {t("success.capability.retrievalCta")}
                                        </Button>
                                      )
                                    })()}
                                    {asyncJobPoll?.status === "completed" &&
                                    asyncJobPoll.result?.preview_available &&
                                    !asyncJobPoll.result?.full_result_available ? (
                                      <TextCaption color="fgMuted" style={{ margin: 0 }}>
                                        {t("success.capability.previewOnlyLarge")}
                                      </TextCaption>
                                    ) : null}
                                    <TextCaption color="fgMuted" style={{ margin: 0 }}>
                                      {t("success.capability.pollHint")}
                                    </TextCaption>
                                  </VStack>
                                </Box>
                              ) : null}

                              {showCapabilityTechnical ? (
                                <Box
                                  as="pre"
                                  bordered
                                  borderRadius={300}
                                  background="bgSecondary"
                                  padding={3}
                                  style={{
                                    margin: 0,
                                    overflow: "auto",
                                    maxHeight: 220,
                                    fontSize: 12,
                                    lineHeight: 1.45,
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                  }}
                                >
                                  {successPaidDisplayJson}
                                </Box>
                              ) : (
                                <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                                  {t("success.capability.technicalHidden")}
                                </TextCaption>
                              )}
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  setShowCapabilityTechnical((v) => !v)
                                }
                                block
                                height="auto"
                                minHeight={44}
                              >
                                {showCapabilityTechnical
                                  ? t("success.capability.hideTechnical")
                                  : t("success.capability.showTechnical")}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  openPaidResource(
                                    paidPayload.type,
                                    paidPayload.value,
                                  )
                                }
                                block
                                height="auto"
                                minHeight={44}
                              >
                                {t("success.capability.openTechnical")}
                              </Button>
                            </>
                          ) : (
                            <>
                              {successNavigableUrl ? (
                                <>
                                  <TextBody
                                    color="fgMuted"
                                    as="p"
                                    style={{ margin: 0 }}
                                  >
                                    {t("buy.openingResource")}
                                  </TextBody>
                                  <TextCaption
                                    color="fgMuted"
                                    as="p"
                                    style={{ margin: 0, wordBreak: "break-word" }}
                                  >
                                    {successNavigableUrl}
                                  </TextCaption>
                                </>
                              ) : (
                                <Box
                                  as="pre"
                                  bordered
                                  borderRadius={300}
                                  background="bgSecondary"
                                  padding={3}
                                  style={{
                                    margin: 0,
                                    overflow: "auto",
                                    maxHeight: 280,
                                    fontSize: 13,
                                    lineHeight: 1.45,
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                  }}
                                >
                                  {successPaidDisplayJson}
                                </Box>
                              )}
                              <Button
                                type="button"
                                variant="primary"
                                onClick={() =>
                                  openPaidResource(
                                    paidPayload.type,
                                    paidPayload.value,
                                  )
                                }
                                block
                                height="auto"
                                minHeight={44}
                              >
                                {t("buy.openResource")}
                              </Button>
                              <TextCaption
                                color="fgMuted"
                                as="p"
                                style={{ margin: 0 }}
                              >
                                {successNavigableUrl
                                  ? t("buy.unlockedSubNavHint")
                                  : t("buy.unlockedSub")}
                              </TextCaption>
                            </>
                          )}
                        </VStack>
                      ) : null}
                    </VStack>
                  ) : null}

                  <NavButtons payHref={payHref} />

                  <TextCaption color="fgMuted" textAlign="center" as="p">
                    <Trans
                      i18nKey="success.footnoteTruth"
                      components={{
                        mono: <TextBody as="span" mono color="fgMuted" />,
                      }}
                    />
                  </TextCaption>
                </VStack>
              </ContentCardBody>
            </ContentCard>
          </VStack>
        </Box>
      </Box>
    )
  }

  // --- Missing attemptId: no success pretense ---
  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      alignItems="center"
      justifyContent="center"
      background="bg"
      color="fg"
      style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
    >
      <Box
        width="100%"
        maxWidth="28rem"
        paddingX={pagePaddingX}
        paddingY={pagePaddingY}
      >
        <VStack gap={2} alignItems="stretch">
          <ContentCard
            width="100%"
            bordered
            background="bgSecondary"
            padding={cardPadding}
            gap={cardGap}
          >
            <ContentCardHeader
              title={
                <TextTitle3 color="fg">{t("success.missingTitle")}</TextTitle3>
              }
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  <Trans
                    i18nKey="success.missingSubtitle"
                    components={{
                      mono1: <TextBody as="span" mono color="fgMuted" />,
                      mono2: <TextBody as="span" mono color="fgMuted" />,
                    }}
                  />
                </TextBody>
              }
            />
            <ContentCardBody>
              <VStack gap={sectionGap} alignItems="stretch">
                <NavButtons
                  payHref={
                    routeSlug && routeSlug !== ""
                      ? unlockPagePath(routeSlug)
                      : "/"
                  }
                />
              </VStack>
            </ContentCardBody>
          </ContentCard>

          {sessionId ? (
            <LegacyCheckoutSessionPanel
              sessionId={sessionId}
              routeSlug={routeSlug}
            />
          ) : null}
        </VStack>
      </Box>
    </Box>
  )
}
