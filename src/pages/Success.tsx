import { useMemo } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextTitle3 } from "@coinbase/cds-web/typography"

const pagePaddingX = { base: 2, desktop: 4 } as const
const pagePaddingY = { base: 3, desktop: 6 } as const
const cardPadding = { base: 3, desktop: 4 } as const
const cardGap = { base: 3, desktop: 4 } as const
const sectionGap = { base: 3, desktop: 4 } as const

function formatPaidAt(value: string | null) {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
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

export default function Success() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()

  const label = searchParams.get("label") || "Payment"
  const amount = searchParams.get("amount") || "0.00"
  const receipt = searchParams.get("receipt") || "Unavailable"
  const status = searchParams.get("status") || "unknown"
  const paidAt = formatPaidAt(searchParams.get("paidAt"))

  const statusLabel = useMemo(() => {
    return status === "paid" ? "Paid" : status
  }, [status])

  const payHref = `/pay/${slug}?amount=${encodeURIComponent(amount)}&label=${encodeURIComponent(label)}`

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      alignItems="center"
      justifyContent="center"
      background="bg"
      color="fg"
      style={{ flex: 1, minHeight: 0 }}
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
              title={<TextTitle3 color="fg">Payment received</TextTitle3>}
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  Your 402.earth payment flow is working.
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
                    <DetailRow label="Label" value={label} />
                    <DetailRow label="Amount" value={`$${amount}`} />
                    <DetailRow label="Slug" value={slug ?? "—"} />
                    <DetailRow label="Status" value={statusLabel} />
                    <DetailRow label="Receipt" value={receipt} />
                    <DetailRow label="Paid at" value={paidAt} />
                  </VStack>
                </Box>

                <VStack gap={2} width="100%" alignItems="stretch">
                  <Button
                    as={Link}
                    to="/"
                    block
                    height="auto"
                    minHeight={44}
                  >
                    Create another QR
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
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
