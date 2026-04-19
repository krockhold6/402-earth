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
  fetchPaidX402Resource,
  fetchPaymentAttempt,
  type PaymentAttemptPayload,
  type PaymentAttemptStatus,
} from "@/lib/api"
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
  const [paidPayloadLoading, setPaidPayloadLoading] = useState(false)
  const [paidPayloadError, setPaidPayloadError] = useState<string | null>(null)

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
      setPaidPayloadError(null)
      setPaidPayloadLoading(false)
      return
    }

    let cancelled = false
    setPaidPayload(null)
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
        return
      }
      setPaidPayload(null)
      setPaidPayloadError(
        data?.error?.trim() ||
          t("success.loadPaidResourceFailed", { status: response.status }),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [attemptId, attempt, t])

  const successNavigableUrl = useMemo(() => {
    if (!paidPayload) return null
    return resolvePaidNavigateUrl(paidPayload.type, paidPayload.value)
  }, [paidPayload])

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
    if (s && s !== "") return `/pay/${encodeURIComponent(s)}`
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
                          {successNavigableUrl ? (
                            <>
                              <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
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
                          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                            {successNavigableUrl
                              ? t("buy.unlockedSubNavHint")
                              : t("buy.unlockedSub")}
                          </TextCaption>
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
                      ? `/pay/${encodeURIComponent(routeSlug)}`
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
