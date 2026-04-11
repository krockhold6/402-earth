import { useMemo } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextTitle1 } from "@coinbase/cds-web/typography"

function formatPaidAt(value: string | null) {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString()
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justifyContent="space-between" alignItems="center" width="100%">
      <TextBody color="fgMuted">{label}</TextBody>
      <TextBody color="fg" fontWeight="label1">
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
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      background="bg"
      color="fg"
      paddingX={6}
      paddingY={10}
    >
      <ContentCard
        width="100%"
        bordered
        borderRadius={500}
        background="bgElevation1"
        padding={6}
        gap={6}
        style={{ maxWidth: "32rem" }}
      >
        <ContentCardHeader
          title={<TextTitle1 color="fg">Payment received</TextTitle1>}
          subtitle={
            <TextBody color="fgMuted" textAlign="center">
              Your 402.earth payment flow is working.
            </TextBody>
          }
        />
        <ContentCardBody>
          <VStack gap={6} alignItems="stretch">
            <Box
              bordered
              borderRadius={400}
              background="bgSecondary"
              padding={5}
            >
              <VStack gap={3} alignItems="stretch">
                <DetailRow label="Label" value={label} />
                <DetailRow label="Amount" value={`$${amount}`} />
                <DetailRow label="Slug" value={slug ?? "—"} />
                <DetailRow label="Status" value={statusLabel} />
                <DetailRow label="Receipt" value={receipt} />
                <DetailRow label="Paid at" value={paidAt} />
              </VStack>
            </Box>

            <Box
              display="flex"
              flexDirection={{ base: "column", desktop: "row" }}
              gap={4}
              width="100%"
            >
              <Box flexGrow={1} minWidth={0} width="100%">
                <Button as={Link} to="/" block>
                  Create another QR
                </Button>
              </Box>
              <Box flexGrow={1} minWidth={0} width="100%">
                <Button as={Link} to={payHref} variant="secondary" block>
                  Back to payment
                </Button>
              </Box>
            </Box>
          </VStack>
        </ContentCardBody>
      </ContentCard>
    </Box>
  )
}
