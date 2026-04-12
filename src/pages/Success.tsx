import { useEffect, useMemo, useState } from "react"
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
  fetchPaymentAttempt,
  type PaymentAttemptPayload,
  type PaymentAttemptStatus,
} from "@/lib/api"
import { LegacyCheckoutSessionPanel } from "@/legacy/LegacyCheckoutSessionPanel"

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
  if (!value) return "—"
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

function attemptHeadline(status: string): string {
  switch (status as PaymentAttemptStatus) {
    case "paid":
      return "Payment received"
    case "payment_required":
      return "Waiting for payment…"
    case "pending":
      return "Waiting for payment…"
    case "failed":
      return "Payment failed"
    case "expired":
      return "Attempt expired"
    case "cancelled":
      return "Payment cancelled"
    case "created":
      return "Waiting for payment…"
    default:
      return "Payment status"
  }
}

function attemptSubtitle(status: string): string {
  switch (status as PaymentAttemptStatus) {
    case "paid":
      return "Your payment was confirmed and this attempt is marked paid."
    case "payment_required":
      return "This page checks the server every few seconds. Complete the transfer from the pay page, or use Advanced there if you need to submit a transaction hash."
    case "pending":
      return "This page checks the server every few seconds. Complete the transfer or wait for confirmation."
    case "failed":
      return "This attempt did not complete successfully. Start a new payment from the pay page if you still need access."
    case "expired":
      return "This attempt is no longer valid. Create a new attempt from the pay page."
    case "cancelled":
      return "This attempt was cancelled."
    case "created":
      return "The attempt was just created and is not ready for payment yet."
    default:
      return "Status is reported by the worker. If this looks wrong, refresh or contact support."
  }
}

function statusPillLabel(status: string): string {
  if (status === "payment_required") return "Payment required"
  return status.replace(/_/g, " ")
}

function NavButtons({ payHref }: { payHref: string }) {
  return (
    <VStack gap={2} width="100%" alignItems="stretch">
      <Button as={Link} to="/" block height="auto" minHeight={44}>
        Home
      </Button>
      <Button
        as={Link}
        to={payHref}
        variant="secondary"
        block
        height="auto"
        minHeight={44}
      >
        Back to payment
      </Button>
    </VStack>
  )
}

export default function Success() {
  const { slug: routeSlug } = useParams()
  const [searchParams] = useSearchParams()
  const attemptId = searchParams.get("attemptId")?.trim() || null
  const sessionId = searchParams.get("sessionId")?.trim() || null

  const [attempt, setAttempt] = useState<PaymentAttemptPayload | null>(null)
  const [attemptError, setAttemptError] = useState<string | null>(null)
  const [attemptInitialLoad, setAttemptInitialLoad] = useState(true)

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
          setAttemptError(data.error || "Could not load payment attempt")
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
          setAttemptError("Could not load payment attempt")
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
  }, [attemptId])

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
      if (attemptError && !attempt) return "Payment attempt unavailable"
      if (!attempt && attemptInitialLoad) return "Waiting for payment…"
      if (!attempt) return "Payment attempt unavailable"
      return attemptHeadline(attempt.status)
    })()
    const subtitle = (() => {
      if (attemptError && !attempt) return attemptError
      if (!attempt && attemptInitialLoad)
        return "Checking your payment attempt with the server…"
      if (!attempt)
        return "We could not read this attempt from the worker. Check the link or try again."
      return attemptSubtitle(attempt.status)
    })()

    const paid = attempt?.status === "paid"
    const headerBg = paid ? "bgPositiveWash" : "bgElevation1"

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
                            Route slug{" "}
                            <TextBody as="span" fontWeight="label1">
                              {routeSlug}
                            </TextBody>{" "}
                            does not match attempt slug{" "}
                            <TextBody as="span" fontWeight="label1">
                              {attempt.slug}
                            </TextBody>
                            . Trust the attempt row below.
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
                            label="Status"
                            value={statusPillLabel(attempt.status)}
                          />
                          <DetailRow label="Label" value={attempt.label} />
                          <DetailRow
                            label="Amount"
                            value={`${attempt.amount} ${attempt.currency}`}
                          />
                          <DetailRow label="Network" value={attempt.network} />
                          <DetailRow label="Slug" value={attempt.slug} />
                          <DetailRow label="Attempt ID" value={attempt.id} />
                          <DetailRow
                            label="Paid at"
                            value={formatTs(attempt.paidAt)}
                          />
                          <DetailRow
                            label="Updated"
                            value={formatTs(attempt.updatedAt)}
                          />
                        </VStack>
                      </Box>
                    </>
                  ) : attemptInitialLoad && !attemptError ? (
                    <TextBody color="fgMuted">Loading attempt…</TextBody>
                  ) : null}

                  <NavButtons payHref={payHref} />

                  <TextCaption color="fgMuted" textAlign="center" as="p">
                    Truth comes from{" "}
                    <TextBody as="span" mono color="fgMuted">
                      GET /api/payment-attempt/:id
                    </TextBody>{" "}
                    only. Query-string flags are not used as payment proof.
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
            background="bgElevation1"
            padding={cardPadding}
            gap={cardGap}
          >
            <ContentCardHeader
              title={
                <TextTitle3 color="fg">Missing payment attempt</TextTitle3>
              }
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  This page needs an{" "}
                  <TextBody as="span" mono color="fgMuted">
                    attemptId
                  </TextBody>{" "}
                  from the x402 flow (e.g.{" "}
                  <TextBody as="span" mono color="fgMuted">
                    /success/demo-001?attemptId=…
                  </TextBody>
                  ). Without it, we cannot show verified payment status.
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
