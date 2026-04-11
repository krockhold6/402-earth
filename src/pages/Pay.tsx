import { useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle1,
  TextTitle3,
} from "@coinbase/cds-web/typography"

function formatAmount(rawAmount: string | null) {
  const parsed = Number(rawAmount)
  if (Number.isNaN(parsed) || parsed <= 0) return null
  return parsed.toFixed(2)
}

export default function Pay() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = searchParams.get("label")?.trim() || "Payment"
  const amount = formatAmount(searchParams.get("amount"))

  const isValid = useMemo(() => {
    return Boolean(slug && amount)
  }, [slug, amount])

  const handlePayNow = async () => {
    if (!slug || !amount || isProcessing) return

    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch(
        "https://api.402.earth/api/payment-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug,
            amount,
            label,
          }),
        },
      )

      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || "Failed to create payment session")
      }

      navigate(data.checkoutUrl)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected payment error"
      setError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Box
      as="main"
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      background="bg"
      color="fg"
    >
      <Box
        width="100%"
        maxWidth="28rem"
        paddingX={{ base: 3, desktop: 6 }}
        paddingY={{ base: 5, desktop: 10 }}
      >
        <VStack gap={4} alignItems="stretch">
          <ContentCard
            width="100%"
            bordered
            borderRadius={500}
            background="bgElevation1"
            padding={{ base: 4, desktop: 6 }}
            gap={{ base: 4, desktop: 6 }}
          >
            <ContentCardHeader
              title={<TextTitle1 color="fg">Payment</TextTitle1>}
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  Complete this payment for 402.earth
                </TextBody>
              }
            />
            <ContentCardBody>
              <VStack gap={{ base: 4, desktop: 6 }} alignItems="stretch">
                <Box
                  bordered
                  borderRadius={400}
                  background="bgSecondary"
                  padding={{ base: 4, desktop: 5 }}
                >
                  <VStack gap={2} alignItems="center">
                    <TextTitle3 color="fg">{label}</TextTitle3>
                    <TextTitle1 color="fg">
                      {amount ? `$${amount}` : "Invalid amount"}
                    </TextTitle1>
                    <TextCaption
                      color="fgMuted"
                      textAlign="center"
                      style={{
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                      }}
                    >
                      Slug: {slug ?? "missing"}
                    </TextCaption>
                  </VStack>
                </Box>

                {!isValid ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgNegativeWash"
                    padding={4}
                  >
                    <TextBody color="fgNegative">
                      This payment link is missing required information.
                    </TextBody>
                  </Box>
                ) : null}

                {error ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgNegativeWash"
                    padding={4}
                  >
                    <TextBody color="fgNegative">{error}</TextBody>
                  </Box>
                ) : null}

                <Button
                  onClick={handlePayNow}
                  disabled={!isValid || isProcessing}
                  block
                >
                  {isProcessing ? "Processing..." : "Pay Now"}
                </Button>

                <TextCaption color="fgMuted" textAlign="center">
                  This button calls the worker seam to create the payment
                  session.
                </TextCaption>
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
