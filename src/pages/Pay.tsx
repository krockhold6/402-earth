import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import {
  createPaymentAttempt,
  fetchResource,
  verifyX402Payment,
  type ApiResource,
} from "@/lib/api"
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

export default function Pay() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [resource, setResource] = useState<ApiResource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done">(
    "idle",
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [attemptError, setAttemptError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!slug) {
      setLoadError("Missing payment slug in the URL.")
      setLoadState("done")
      setResource(null)
      return
    }
    setLoadState("loading")
    setLoadError(null)
    try {
      const data = await fetchResource(slug)
      if (!data.ok || !data.resource) {
        setResource(null)
        setLoadError(data.error || "Resource not found or unavailable.")
        return
      }
      setResource(data.resource)
      setLoadError(null)
    } catch {
      setResource(null)
      setLoadError("Could not load this payment. Check your connection and try again.")
    } finally {
      setLoadState("done")
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const MOCK_SIGNATURE = "browser-mock-signature"

  const handlePayNow = async () => {
    if (!slug || !resource || isProcessing) return

    setIsProcessing(true)
    setAttemptError(null)

    try {
      const { response: attemptRes, data: attemptData } =
        await createPaymentAttempt({
          slug,
          clientType: "browser",
        })

      if (!attemptRes.ok || !attemptData?.ok || !attemptData.attemptId) {
        throw new Error(
          attemptData?.error || "Failed to create payment attempt",
        )
      }

      const attemptId = attemptData.attemptId

      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId,
          slug,
          paymentSignature: MOCK_SIGNATURE,
        },
      )

      const verifyOk =
        verifyRes.ok &&
        verifyData?.ok === true &&
        verifyData.status === "paid"

      if (!verifyOk) {
        const detail =
          (verifyData?.error && verifyData.error.trim()) ||
          `Verification request failed (HTTP ${verifyRes.status}).`
        const code =
          verifyData?.code != null && String(verifyData.code).trim() !== ""
            ? ` (${String(verifyData.code).trim()})`
            : ""
        throw new Error(`${detail}${code}`.trim())
      }

      navigate(
        `/success/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`,
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected payment error"
      setAttemptError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const showResourceSkeleton = loadState === "loading"
  const showResourceError = loadState === "done" && loadError
  const canPay =
    Boolean(slug && resource && resource.active) &&
    loadState === "done" &&
    !loadError

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
        maxWidth="26rem"
        paddingX={{ base: 2, desktop: 4 }}
        paddingY={{ base: 3, desktop: 6 }}
      >
        <VStack gap={2} alignItems="stretch">
          <ContentCard
            width="100%"
            bordered
            background="bgElevation1"
            padding={{ base: 3, desktop: 4 }}
            gap={{ base: 3, desktop: 4 }}
          >
            <ContentCardHeader
              title={
                <TextTitle3 color="fg">x402 payment (browser)</TextTitle3>
              }
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  This page is a human wrapper around the x402-native worker.
                  Pay creates an attempt, then calls a{" "}
                  <TextBody as="span" fontWeight="label1" color="fgMuted">
                    mock
                  </TextBody>{" "}
                  verification bridge—no real on-chain payment is implied.
                </TextBody>
              }
            />
            <ContentCardBody>
              <VStack gap={{ base: 3, desktop: 4 }} alignItems="stretch">
                <Box
                  bordered
                  borderRadius={400}
                  background="bgSecondary"
                  padding={{ base: 3, desktop: 4 }}
                >
                  <VStack gap={2} alignItems="stretch">
                    <TextCaption color="fgMuted" fontWeight="label1" as="p">
                      Resource
                    </TextCaption>
                    {showResourceSkeleton ? (
                      <TextBody color="fgMuted">Loading…</TextBody>
                    ) : showResourceError ? (
                      <Box
                        bordered
                        borderRadius={400}
                        background="bgNegativeWash"
                        padding={3}
                      >
                        <TextBody color="fgNegative">{loadError}</TextBody>
                      </Box>
                    ) : resource ? (
                      <>
                        <TextTitle3 color="fg">{resource.label}</TextTitle3>
                        <TextTitle1 color="fg">
                          {resource.amount} {resource.currency}
                        </TextTitle1>
                        <VStack gap={1} alignItems="stretch">
                          <TextBody color="fgMuted">
                            Network:{" "}
                            <TextBody as="span" color="fg" fontWeight="label1">
                              {resource.network}
                            </TextBody>
                          </TextBody>
                          <TextCaption
                            color="fgMuted"
                            style={{
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                            }}
                          >
                            Slug: {resource.slug}
                          </TextCaption>
                        </VStack>
                      </>
                    ) : (
                      <TextBody color="fgMuted">No resource data.</TextBody>
                    )}
                  </VStack>
                </Box>

                {attemptError ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgNegativeWash"
                    padding={3}
                  >
                    <TextBody color="fgNegative">{attemptError}</TextBody>
                  </Box>
                ) : null}

                <Box
                  bordered
                  borderRadius={400}
                  background="bgSecondary"
                  padding={3}
                >
                  <VStack gap={1} alignItems="stretch">
                    <TextCaption color="fgMuted" fontWeight="label1" as="p">
                      What happens when you tap Pay
                    </TextCaption>
                    <TextBody color="fgMuted">
                      Step 1:{" "}
                      <TextBody as="span" color="fg" fontWeight="label1">
                        POST /api/payment-attempt
                      </TextBody>{" "}
                      (
                      <TextBody as="span" color="fg" fontWeight="label1">
                        clientType: browser
                      </TextBody>
                      ). Step 2:{" "}
                      <TextBody as="span" color="fg" fontWeight="label1">
                        POST /x402/verify
                      </TextBody>{" "}
                      with a placeholder signature (
                      <TextBody as="span" mono color="fgMuted">
                        browser-mock-signature
                      </TextBody>
                      ) so dev can exercise the seam when the worker has mock
                      verify enabled. Then we open the success page to poll
                      attempt status—still not proof of a real chain transfer.
                    </TextBody>
                  </VStack>
                </Box>

                <Button
                  onClick={handlePayNow}
                  disabled={!canPay || isProcessing}
                  block
                >
                  {isProcessing
                    ? "Creating attempt & mock verify…"
                    : "Pay"}
                </Button>

                <TextCaption color="fgMuted" textAlign="center" as="p">
                  If verify returns 503, set{" "}
                  <TextBody as="span" mono color="fgMuted">
                    X402_MOCK_VERIFY=true
                  </TextBody>{" "}
                  in the worker{" "}
                  <TextBody as="span" mono color="fgMuted">
                    .dev.vars
                  </TextBody>{" "}
                  for local dev.
                </TextCaption>
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
