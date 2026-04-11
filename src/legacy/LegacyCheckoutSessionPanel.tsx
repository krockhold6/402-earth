/**
 * Optional UI for old Coinbase checkout links (?sessionId= on /success).
 * Not part of the primary x402 payment-attempt flow.
 */
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"
import {
  fetchLegacyPaymentSession,
  type LegacyPaymentSessionPayload,
} from "@/lib/api"

const cardPadding = { base: 3, desktop: 4 } as const
const cardGap = { base: 3, desktop: 4 } as const
const sectionGap = { base: 3, desktop: 4 } as const
const POLL_MS = 2500

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

export function LegacyCheckoutSessionPanel({
  sessionId,
  routeSlug,
}: {
  sessionId: string
  routeSlug: string | undefined
}) {
  const [session, setSession] = useState<LegacyPaymentSessionPayload | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const terminal = new Set(["paid", "failed", "expired", "cancelled"])

    const load = async () => {
      try {
        const data = await fetchLegacyPaymentSession(sessionId)
        if (cancelled) return
        if (!data.ok || !data.session) {
          setError(data.error || "Could not load checkout session")
          setSession(null)
          return
        }
        setError(null)
        setSession(data.session)
        if (terminal.has(data.session.status) && timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      } catch {
        if (!cancelled) setError("Could not load checkout session")
      }
    }

    timer = window.setInterval(load, POLL_MS)
    void load()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [sessionId])

  const paySlug = session?.slug ?? routeSlug ?? ""
  const payHref =
    paySlug !== "" ? `/pay/${encodeURIComponent(paySlug)}` : "/"

  return (
    <ContentCard
      width="100%"
      bordered
      background="bgElevation1"
      padding={cardPadding}
      gap={cardGap}
    >
      <ContentCardHeader
        title={
          <TextTitle3 color="fg">Legacy Coinbase checkout session</TextTitle3>
        }
        subtitle={
          <TextBody color="fgMuted" textAlign="center">
            Older flow using{" "}
            <TextBody as="span" mono color="fgMuted">
              /api/payment-session
            </TextBody>
            . Unrelated to x402 payment attempts; shown only when{" "}
            <TextBody as="span" mono color="fgMuted">
              sessionId
            </TextBody>{" "}
            is present.
          </TextBody>
        }
      />
      <ContentCardBody>
        <VStack gap={sectionGap} alignItems="stretch">
          <Box
            bordered
            borderRadius={400}
            background="bgSecondary"
            padding={{ base: 3, desktop: 4 }}
          >
            <VStack gap={2} alignItems="stretch">
              <DetailRow label="Checkout session ID" value={sessionId} />
              {error ? (
                <TextBody color="fgNegative">{error}</TextBody>
              ) : session ? (
                <>
                  <DetailRow label="Label" value={session.label} />
                  <DetailRow
                    label="Amount"
                    value={`${session.amount} ${session.currency}`}
                  />
                  <DetailRow label="Status" value={session.status} />
                  <DetailRow label="Paid at" value={formatTs(session.paidAt)} />
                </>
              ) : (
                <TextBody color="fgMuted">Loading checkout session…</TextBody>
              )}
            </VStack>
          </Box>
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
          <TextCaption color="fgMuted" textAlign="center" as="p">
            Webhook-driven status only—do not treat as x402 attempt truth.
          </TextCaption>
        </VStack>
      </ContentCardBody>
    </ContentCard>
  )
}
