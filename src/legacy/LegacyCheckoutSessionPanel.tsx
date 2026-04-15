/**
 * Optional UI for old Coinbase checkout links (?sessionId= on /success).
 * Not part of the primary x402 payment-attempt flow.
 */
import { useEffect, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
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
import i18n from "@/i18n/config"

const cardPadding = { base: 3, desktop: 4 } as const
const cardGap = { base: 3, desktop: 4 } as const
const sectionGap = { base: 3, desktop: 4 } as const
const POLL_MS = 2500

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

export function LegacyCheckoutSessionPanel({
  sessionId,
  routeSlug,
}: {
  sessionId: string
  routeSlug: string | undefined
}) {
  const { t } = useTranslation()
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
          setError(data.error || t("legacy.loadError"))
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
        if (!cancelled) setError(t("legacy.loadError"))
      }
    }

    timer = window.setInterval(load, POLL_MS)
    void load()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [sessionId, t])

  const paySlug = session?.slug ?? routeSlug ?? ""
  const payHref =
    paySlug !== "" ? `/pay/${encodeURIComponent(paySlug)}` : "/"

  return (
    <ContentCard
      width="100%"
      bordered
      background="bgSecondary"
      padding={cardPadding}
      gap={cardGap}
    >
      <ContentCardHeader
        title={
          <TextTitle3 color="fg">{t("legacy.title")}</TextTitle3>
        }
        subtitle={
          <TextBody color="fgMuted" textAlign="center">
            <Trans
              i18nKey="legacy.subtitle"
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
          <Box
            bordered
            borderRadius={400}
            background="bgSecondary"
            padding={{ base: 3, desktop: 4 }}
          >
            <VStack gap={2} alignItems="stretch">
              <DetailRow
                label={t("legacy.checkoutSessionId")}
                value={sessionId}
              />
              {error ? (
                <TextBody color="fgNegative">{error}</TextBody>
              ) : session ? (
                <>
                  <DetailRow
                    label={t("legacy.detailLabel")}
                    value={session.label}
                  />
                  <DetailRow
                    label={t("legacy.detailAmount")}
                    value={`${session.amount} ${session.currency}`}
                  />
                  <DetailRow
                    label={t("legacy.detailStatus")}
                    value={session.status}
                  />
                  <DetailRow
                    label={t("legacy.detailPaidAt")}
                    value={formatTs(session.paidAt)}
                  />
                </>
              ) : (
                <TextBody color="fgMuted">{t("legacy.loading")}</TextBody>
              )}
            </VStack>
          </Box>
          <VStack gap={2} width="100%" alignItems="stretch">
            <Button as={Link} to="/" block height="auto" minHeight={44}>
              {t("legacy.navHome")}
            </Button>
            <Button
              as={Link}
              to={payHref}
              variant="secondary"
              block
              height="auto"
              minHeight={44}
            >
              {t("legacy.navBackToPay")}
            </Button>
          </VStack>
          <TextCaption color="fgMuted" textAlign="center" as="p">
            {t("legacy.footnote")}
          </TextCaption>
        </VStack>
      </ContentCardBody>
    </ContentCard>
  )
}
