import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import {
  createPaymentAttempt,
  fetchPaymentAttempt,
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

/** USDC amount string → uint256 minor units (6 decimals) for EIP-681. */
function usdcAmountToUint256String(amountStr: string): string | null {
  const t = amountStr.trim()
  if (!t) return null
  const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(t)
  if (!m) return null
  const fracRaw = m[2] ?? ""
  if (fracRaw.length > 6) return null
  const frac = fracRaw.padEnd(6, "0")
  try {
    const minor = BigInt(m[1]) * 1_000_000n + BigInt(frac === "" ? "0" : frac)
    return minor.toString()
  } catch {
    return null
  }
}

/**
 * [EIP-681](https://eips.ethereum.org/EIPS/eip-681) ERC-20 transfer on Base.
 * Opens compatible wallets to send USDC to the configured receiver.
 */
function buildBaseUsdcWalletDeepLink(resource: ApiResource): string | null {
  const recv = resource.paymentReceiverAddress?.trim()
  const token = resource.usdcContractAddress?.trim()
  if (!recv || !token) return null
  if (resource.network.toLowerCase() !== "base") return null
  if (resource.currency.toUpperCase() !== "USDC") return null
  const minor = usdcAmountToUint256String(resource.amount)
  if (!minor) return null
  const chainId = 8453
  return `ethereum:${token.toLowerCase()}@${chainId}/transfer?address=${recv.toLowerCase()}&uint256=${minor}`
}

type PayFlow = "select" | "stripe_pending" | "crypto_wallet"

export default function Pay() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const attemptIdFromUrl = searchParams.get("attemptId")?.trim() || null
  const [resource, setResource] = useState<ApiResource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done">(
    "idle",
  )

  const [flow, setFlow] = useState<PayFlow>("select")
  const [manualAdvancedOpen, setManualAdvancedOpen] = useState(false)
  const [cryptoAdvancedOpen, setCryptoAdvancedOpen] = useState(false)
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
    setFlow("select")
    setManualAdvancedOpen(false)
    setCryptoAdvancedOpen(false)
    setAttemptId(null)
    setTxHash("")
    setAttemptError(null)
    setVerifyError(null)
  }, [slug])

  useEffect(() => {
    if (
      !attemptIdFromUrl ||
      !slug ||
      loadState !== "done" ||
      !resource ||
      loadError
    ) {
      return
    }

    let cancelled = false
    ;(async () => {
      const data = await fetchPaymentAttempt(attemptIdFromUrl)
      if (cancelled) return
      if (!data.ok || !data.attempt) {
        setAttemptError(
          data.error?.trim() ||
            "This payment link is invalid or no longer available.",
        )
        return
      }
      if (data.attempt.slug !== slug) {
        setAttemptError("This payment link does not match this product.")
        return
      }
      setAttemptError(null)
      setAttemptId(attemptIdFromUrl)
    })()

    return () => {
      cancelled = true
    }
  }, [attemptIdFromUrl, loadError, loadState, resource, slug])

  const goToSuccess = useCallback(
    (id: string) => {
      if (!slug) return
      navigate(
        `/success/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(id)}`,
      )
    },
    [navigate, slug],
  )

  const resetToPaymentChoice = useCallback(() => {
    setFlow("select")
    setManualAdvancedOpen(false)
    setCryptoAdvancedOpen(false)
    setTxHash("")
    setVerifyError(null)
    setAttemptError(null)
    if (slug && attemptIdFromUrl) {
      navigate(`/pay/${encodeURIComponent(slug)}`, { replace: true })
    }
    setAttemptId(null)
  }, [attemptIdFromUrl, navigate, slug])

  const createAttempt = useCallback(async (): Promise<string | null> => {
    if (!slug || !resource) return null
    if (attemptId) return attemptId

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

      const id = attemptData.attemptId
      setAttemptId(id)
      return id
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error creating attempt"
      setAttemptError(message)
      return null
    } finally {
      setIsCreatingAttempt(false)
    }
  }, [attemptId, resource, slug])

  const handlePayWithCard = async () => {
    if (!canInteract) return
    setManualAdvancedOpen(false)
    const id = await createAttempt()
    if (id) setFlow("stripe_pending")
  }

  const handlePayWithCrypto = async () => {
    if (!canInteract) return
    setManualAdvancedOpen(false)
    setCryptoAdvancedOpen(false)
    const id = await createAttempt()
    if (id) setFlow("crypto_wallet")
  }

  const handleOpenWallet = () => {
    if (!resource) return
    const href = buildBaseUsdcWalletDeepLink(resource)
    if (!href) return
    window.location.href = href
  }

  const handleOpenAdvancedManual = () => {
    setVerifyError(null)
    setAttemptError(null)
    setManualAdvancedOpen(true)
    setFlow("select")
  }

  const handleManualPanelCreateAttempt = async () => {
    if (!canInteract) return
    await createAttempt()
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
  const linkValidationPending =
    attemptIdFromUrl != null &&
    loadState === "done" &&
    resource != null &&
    attemptId == null &&
    attemptError == null

  const canInteract =
    Boolean(slug && resource && resource.active) &&
    loadState === "done" &&
    !loadError &&
    !(attemptIdFromUrl && attemptError) &&
    !linkValidationPending

  const isDev = import.meta.env.DEV

  const walletDeepLink =
    resource != null ? buildBaseUsdcWalletDeepLink(resource) : null

  const showCryptoPrimaryPanel = flow === "crypto_wallet" && resource != null

  const showAdvancedOnlyPanel =
    flow === "select" && manualAdvancedOpen && resource != null

  const showMethodSelector = flow === "select" && !showResourceSkeleton

  const showAdvancedTxToggle =
    flow === "select" && !showResourceSkeleton && !manualAdvancedOpen

  const advancedTxForm = (opts: { title: string; showBackToMethods: boolean }) => (
    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
      <TextCaption color="fgMuted" fontWeight="label1" as="p">
        {opts.title}
      </TextCaption>
      <TextBody color="fgMuted" as="p">
        Send{" "}
        <TextBody as="span" color="fg" fontWeight="label1">
          at least {resource!.amount} {resource!.currency}
        </TextBody>{" "}
        on Base to this site’s configured recipient. The worker detects USDC
        transfers automatically when you open the status page; use this form
        only if you need to force verification with a known transaction hash.
      </TextBody>

      {!attemptId ? (
        <Button
          onClick={handleManualPanelCreateAttempt}
          disabled={!canInteract || isCreatingAttempt}
          block
        >
          {isCreatingAttempt ? "Creating attempt…" : "Create payment attempt"}
        </Button>
      ) : (
        <>
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
                Amount (minimum): {resource!.amount} {resource!.currency}
              </TextBody>
              <TextBody color="fg">Network: {resource!.network}</TextBody>
              <TextBody color="fg">Slug: {resource!.slug}</TextBody>
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
            {isVerifying ? "Verifying…" : "Verify with transaction hash"}
          </Button>
        </>
      )}

      {opts.showBackToMethods ? (
        <Button
          variant="secondary"
          onClick={resetToPaymentChoice}
          disabled={isVerifying}
          block
        >
          Back to payment options
        </Button>
      ) : null}
    </VStack>
  )

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
              title={<TextTitle3 color="fg">Pay</TextTitle3>}
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  Choose how to pay. Crypto uses automatic on-chain detection—no
                  transaction hash required unless you use Advanced. Nothing is
                  marked paid until the backend confirms it.
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

                {linkValidationPending ? (
                  <TextBody color="fgMuted" textAlign="center" as="p">
                    Confirming your payment link…
                  </TextBody>
                ) : null}

                {(attemptError || verifyError) && (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgNegativeWash"
                    padding={3}
                  >
                    <VStack gap={2} alignItems="stretch">
                      <TextBody color="fgNegative">
                        {verifyError ?? attemptError}
                      </TextBody>
                      {attemptIdFromUrl && attemptError && slug ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            navigate(
                              `/pay/${encodeURIComponent(slug)}`,
                              { replace: true },
                            )
                            setAttemptError(null)
                            setVerifyError(null)
                          }}
                          block
                        >
                          Open pay page without this link
                        </Button>
                      ) : null}
                    </VStack>
                  </Box>
                )}

                {flow === "stripe_pending" && attemptId && resource ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={{ base: 3, desktop: 4 }}
                  >
                    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
                      <TextCaption color="fgMuted" fontWeight="label1" as="p">
                        Card payment
                      </TextCaption>
                      <TextBody color="fgMuted" as="p">
                        A payment attempt is ready on the server (
                        <TextBody as="span" mono color="fgMuted">
                          {attemptId.slice(0, 12)}…
                        </TextBody>
                        ).{" "}
                        <TextBody as="span" color="fg" fontWeight="label1">
                          Stripe Checkout is not wired up yet
                        </TextBody>
                        —this panel is where we will create a Stripe checkout
                        session and redirect you. No charge happens until that
                        ships.
                      </TextBody>
                      <Box
                        bordered
                        borderRadius={400}
                        background="bgElevation1"
                        padding={3}
                      >
                        <TextCaption color="fgMuted" fontWeight="label1" as="p">
                          Next implementation step
                        </TextCaption>
                        <TextBody color="fgMuted">
                          Call Stripe (e.g. Checkout Session) with this{" "}
                          <TextBody as="span" mono color="fgMuted">
                            attemptId
                          </TextBody>{" "}
                          in metadata, then send the customer to Stripe’s hosted
                          checkout URL.
                        </TextBody>
                      </Box>
                      <Button
                        variant="secondary"
                        onClick={resetToPaymentChoice}
                        disabled={isCreatingAttempt}
                        block
                      >
                        Back to payment options
                      </Button>
                    </VStack>
                  </Box>
                ) : null}

                {showMethodSelector ? (
                  <VStack gap={2} alignItems="stretch">
                    <TextCaption color="fgMuted" fontWeight="label1" as="p">
                      Payment method
                    </TextCaption>
                    <Button
                      onClick={handlePayWithCard}
                      disabled={!canInteract || isCreatingAttempt}
                      block
                    >
                      {isCreatingAttempt ? "Working…" : "Pay with card"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handlePayWithCrypto}
                      disabled={!canInteract || isCreatingAttempt}
                      block
                    >
                      {isCreatingAttempt ? "Working…" : "Pay with crypto"}
                    </Button>
                  </VStack>
                ) : null}

                {showCryptoPrimaryPanel ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={{ base: 3, desktop: 4 }}
                  >
                    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
                      <TextCaption color="fgMuted" fontWeight="label1" as="p">
                        Crypto on Base (USDC)
                      </TextCaption>
                      <TextBody color="fgMuted" as="p">
                        Open your wallet to send the payment. When you continue
                        to the status page, the server scans Base for your
                        transfer and marks this attempt paid automatically—no
                        hash required.
                      </TextBody>
                      {attemptId ? (
                        <TextBody mono as="code" color="fgMuted" overflow="wrap">
                          attemptId: {attemptId}
                        </TextBody>
                      ) : null}

                      <Button
                        onClick={handleOpenWallet}
                        disabled={!walletDeepLink}
                        block
                      >
                        Pay with wallet
                      </Button>
                      {!walletDeepLink ? (
                        <TextCaption color="fgMuted" as="p">
                          Wallet link is unavailable (receiver not configured on
                          the API). Use Advanced to verify with a transaction
                          hash, or contact support.
                        </TextCaption>
                      ) : null}

                      <Button
                        variant="secondary"
                        onClick={() => attemptId && goToSuccess(attemptId)}
                        disabled={!attemptId}
                        block
                      >
                        View payment status
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={resetToPaymentChoice}
                        disabled={isVerifying}
                        block
                      >
                        Back to payment options
                      </Button>

                      {attemptId ? (
                        <Box paddingTop={1}>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setCryptoAdvancedOpen((o) => !o)
                            }
                            block
                          >
                            {cryptoAdvancedOpen
                              ? "Hide Advanced"
                              : "Advanced — verify with transaction hash"}
                          </Button>
                        </Box>
                      ) : null}

                      {cryptoAdvancedOpen && attemptId ? (
                        <Box
                          bordered
                          borderRadius={400}
                          background="bgElevation1"
                          padding={3}
                        >
                          <VStack gap={2} alignItems="stretch">
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
                              {isVerifying
                                ? "Verifying…"
                                : "Verify with transaction hash"}
                            </Button>
                          </VStack>
                        </Box>
                      ) : null}

                      {isDev && attemptId ? (
                        <Box
                          bordered
                          borderRadius={400}
                          background="bgSecondary"
                          padding={3}
                        >
                          <VStack gap={2} alignItems="stretch">
                            <TextCaption
                              color="fgMuted"
                              fontWeight="label1"
                              as="p"
                            >
                              Developer shortcut
                            </TextCaption>
                            <TextBody color="fgMuted">
                              With{" "}
                              <TextBody as="span" mono color="fgMuted">
                                X402_MOCK_VERIFY=true
                              </TextBody>{" "}
                              on the worker, mock verify skips the chain (not for
                              production).
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
                    </VStack>
                  </Box>
                ) : null}

                {showAdvancedOnlyPanel ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={{ base: 3, desktop: 4 }}
                  >
                    {advancedTxForm({
                      title: "Advanced — verify with transaction hash",
                      showBackToMethods: true,
                    })}
                  </Box>
                ) : null}

                {showAdvancedTxToggle && canInteract ? (
                  <Box paddingTop={1}>
                    <Button
                      variant="secondary"
                      onClick={handleOpenAdvancedManual}
                      disabled={!canInteract}
                      block
                    >
                      Advanced — verify with transaction hash
                    </Button>
                  </Box>
                ) : null}

                {manualAdvancedOpen && flow === "select" ? (
                  <Box paddingTop={1}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setManualAdvancedOpen(false)
                        setAttemptId(null)
                        setTxHash("")
                        setVerifyError(null)
                      }}
                      disabled={isCreatingAttempt}
                      block
                    >
                      Hide advanced
                    </Button>
                  </Box>
                ) : null}

                <TextCaption color="fgMuted" textAlign="center" as="p">
                  Status updates use{" "}
                  <TextBody as="span" mono color="fgMuted">
                    GET /api/payment-attempt/:id
                  </TextBody>
                  , which re-checks the chain while the attempt is unpaid.
                </TextCaption>
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
