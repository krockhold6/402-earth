import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
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

const DEV_MOCK_SIGNATURE = "browser-mock-signature"

function isLikelyTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim())
}

export default function Pay() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [resource, setResource] = useState<ApiResource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done">(
    "idle",
  )

  /** After creating an attempt, user sends USDC and pastes tx hash. */
  const [phase, setPhase] = useState<"ready" | "awaiting_tx">("ready")
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState("")

  const [isCreatingAttempt, setIsCreatingAttempt] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [attemptError, setAttemptError] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

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
      setLoadError(
        "Could not load this payment. Check your connection and try again.",
      )
    } finally {
      setLoadState("done")
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPhase("ready")
    setAttemptId(null)
    setTxHash("")
    setAttemptError(null)
    setVerifyError(null)
  }, [slug])

  const goToSuccess = useCallback(
    (id: string) => {
      if (!slug) return
      navigate(
        `/success/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(id)}`,
      )
    },
    [navigate, slug],
  )

  const handleCreateAttempt = async () => {
    if (!slug || !resource || isCreatingAttempt) return

    setIsCreatingAttempt(true)
    setAttemptError(null)
    setVerifyError(null)

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

      setAttemptId(attemptData.attemptId)
      setPhase("awaiting_tx")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error creating attempt"
      setAttemptError(message)
    } finally {
      setIsCreatingAttempt(false)
    }
  }

  const handleVerifyWithTxHash = async () => {
    if (!slug || !attemptId || isVerifying) return

    const trimmed = txHash.trim()
    if (!trimmed) {
      setVerifyError("Paste the transaction hash from your wallet or block explorer.")
      return
    }
    if (!isLikelyTxHash(trimmed)) {
      setVerifyError(
        "That does not look like a valid transaction hash (expected 0x followed by 64 hex characters).",
      )
      return
    }

    setIsVerifying(true)
    setVerifyError(null)

    try {
      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId,
          slug,
          txHash: trimmed,
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

      goToSuccess(attemptId)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected verification error"
      setVerifyError(message)
    } finally {
      setIsVerifying(false)
    }
  }

  /** Local dev only: worker with `X402_MOCK_VERIFY` accepts a placeholder signature. */
  const handleDevMockVerify = async () => {
    if (!slug || !attemptId || isVerifying) return

    setIsVerifying(true)
    setVerifyError(null)

    try {
      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId,
          slug,
          paymentSignature: DEV_MOCK_SIGNATURE,
        },
      )

      const verifyOk =
        verifyRes.ok &&
        verifyData?.ok === true &&
        verifyData.status === "paid"

      if (!verifyOk) {
        const detail =
          (verifyData?.error && verifyData.error.trim()) ||
          `Mock verify failed (HTTP ${verifyRes.status}).`
        const code =
          verifyData?.code != null && String(verifyData.code).trim() !== ""
            ? ` (${String(verifyData.code).trim()})`
            : ""
        throw new Error(`${detail}${code}`.trim())
      }

      goToSuccess(attemptId)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected verification error"
      setVerifyError(message)
    } finally {
      setIsVerifying(false)
    }
  }

  const showResourceSkeleton = loadState === "loading"
  const showResourceError = loadState === "done" && loadError
  const canStart =
    Boolean(slug && resource && resource.active) &&
    loadState === "done" &&
    !loadError

  const isDev = import.meta.env.DEV

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
                  This page talks to the x402 worker. Payment is{" "}
                  <TextBody as="span" fontWeight="label1" color="fgMuted">
                    not
                  </TextBody>{" "}
                  automatic: you send USDC on Base yourself, then we verify the
                  transaction hash. Nothing is marked paid until verification
                  succeeds.
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

                {phase === "awaiting_tx" && attemptId && resource ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={{ base: 3, desktop: 4 }}
                  >
                    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
                      <TextCaption color="fgMuted" fontWeight="label1" as="p">
                        Step 2 — Send payment, then verify
                      </TextCaption>
                      <TextBody color="fgMuted" as="p">
                        Send{" "}
                        <TextBody as="span" color="fg" fontWeight="label1">
                          at least {resource.amount} {resource.currency}
                        </TextBody>{" "}
                        on{" "}
                        <TextBody as="span" color="fg" fontWeight="label1">
                          Base
                        </TextBody>{" "}
                        to the recipient address configured for this site (this
                        page does not connect your wallet). After the transfer
                        is submitted, copy the transaction hash and paste it
                        below. We only mark this attempt paid after on-chain
                        verification succeeds.
                      </TextBody>
                      <Box
                        bordered
                        borderRadius={400}
                        background="bgElevation1"
                        padding={3}
                      >
                        <VStack gap={1} alignItems="stretch">
                          <TextCaption color="fgMuted" fontWeight="label1">
                            Payment details
                          </TextCaption>
                          <TextBody color="fg">
                            Amount (minimum): {resource.amount}{" "}
                            {resource.currency}
                          </TextBody>
                          <TextBody color="fg">Network: {resource.network}</TextBody>
                          <TextBody color="fg">Slug: {resource.slug}</TextBody>
                          <TextBody mono as="code" color="fg" overflow="wrap">
                            attemptId: {attemptId}
                          </TextBody>
                        </VStack>
                      </Box>
                      <TextInput
                        compact
                        label="Transaction hash"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder="0x…"
                      />
                      <Button
                        onClick={handleVerifyWithTxHash}
                        disabled={isVerifying}
                        block
                      >
                        {isVerifying ? "Verifying…" : "Verify payment"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setPhase("ready")
                          setAttemptId(null)
                          setTxHash("")
                          setVerifyError(null)
                        }}
                        disabled={isVerifying}
                        block
                      >
                        Start over
                      </Button>
                    </VStack>
                  </Box>
                ) : null}

                {(attemptError || verifyError) && (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgNegativeWash"
                    padding={3}
                  >
                    <TextBody color="fgNegative">
                      {verifyError ?? attemptError}
                    </TextBody>
                  </Box>
                )}

                {phase === "ready" ? (
                  <>
                    <Box
                      bordered
                      borderRadius={400}
                      background="bgSecondary"
                      padding={3}
                    >
                      <VStack gap={1} alignItems="stretch">
                        <TextCaption color="fgMuted" fontWeight="label1" as="p">
                          Step 1 — Create an attempt
                        </TextCaption>
                        <TextBody color="fgMuted">
                          Tap below to call{" "}
                          <TextBody as="span" color="fg" fontWeight="label1">
                            POST /api/payment-attempt
                          </TextBody>{" "}
                          (
                          <TextBody as="span" color="fg" fontWeight="label1">
                            clientType: browser
                          </TextBody>
                          ). You will then see what to pay and where to paste
                          your tx hash. We do{" "}
                          <TextBody as="span" fontWeight="label1" color="fgMuted">
                            not
                          </TextBody>{" "}
                          call{" "}
                          <TextBody as="span" color="fg" fontWeight="label1">
                            /x402/verify
                          </TextBody>{" "}
                          until you submit a real hash.
                        </TextBody>
                      </VStack>
                    </Box>

                    <Button
                      onClick={handleCreateAttempt}
                      disabled={!canStart || isCreatingAttempt}
                      block
                    >
                      {isCreatingAttempt
                        ? "Creating attempt…"
                        : "Create payment attempt"}
                    </Button>
                  </>
                ) : null}

                {isDev && phase === "awaiting_tx" && attemptId ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={3}
                  >
                    <VStack gap={2} alignItems="stretch">
                      <TextCaption color="fgMuted" fontWeight="label1" as="p">
                        Developer shortcut
                      </TextCaption>
                      <TextBody color="fgMuted">
                        If the worker has{" "}
                        <TextBody as="span" mono color="fgMuted">
                          X402_MOCK_VERIFY=true
                        </TextBody>{" "}
                        in{" "}
                        <TextBody as="span" mono color="fgMuted">
                          .dev.vars
                        </TextBody>
                        , you can skip the blockchain and run a mock verify (not
                        for production).
                      </TextBody>
                      <Button
                        variant="secondary"
                        onClick={handleDevMockVerify}
                        disabled={isVerifying}
                        block
                      >
                        Dev: mock verify (no tx hash)
                      </Button>
                    </VStack>
                  </Box>
                ) : null}

                <TextCaption color="fgMuted" textAlign="center" as="p">
                  Production requires a real Base USDC transfer and a valid{" "}
                  <TextBody as="span" mono color="fgMuted">
                    txHash
                  </TextBody>
                  .
                </TextCaption>
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
