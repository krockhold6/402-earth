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

function resourceReceiver(resource: ApiResource): string {
  return (
    resource.paymentReceiverAddress?.trim() ||
    resource.receiverAddress?.trim() ||
    ""
  )
}

/**
 * [EIP-681](https://eips.ethereum.org/EIPS/eip-681) ERC-20 transfer on Base.
 * Opens Coinbase Wallet, Base app, and other wallets that handle `ethereum:` URIs.
 */
function buildBaseUsdcEip681Link(resource: ApiResource): string | null {
  const recv = resourceReceiver(resource)
  const token = resource.usdcContractAddress?.trim()
  if (!recv || !token) return null
  if (resource.network.toLowerCase() !== "base") return null
  if (resource.currency.toUpperCase() !== "USDC") return null
  const minor = usdcAmountToUint256String(resource.amount)
  if (!minor) return null
  const chainId = 8453
  return `ethereum:${token.toLowerCase()}@${chainId}/transfer?address=${recv.toLowerCase()}&uint256=${minor}`
}

/**
 * MetaMask mobile deep link — see
 * https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/
 */
function buildMetaMaskUsdcSendLink(resource: ApiResource): string | null {
  const recv = resourceReceiver(resource)
  const token = resource.usdcContractAddress?.trim()
  if (!recv || !token) return null
  if (resource.network.toLowerCase() !== "base") return null
  if (resource.currency.toUpperCase() !== "USDC") return null
  const minor = usdcAmountToUint256String(resource.amount)
  if (!minor) return null
  const chainId = 8453
  const path = `${token.toLowerCase()}@${chainId}/transfer`
  const q = new URLSearchParams({
    address: recv.toLowerCase(),
    uint256: minor,
  })
  return `https://link.metamask.io/send/${path}?${q.toString()}`
}

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

  const openPayUrlWithAttempt = useCallback(
    (id: string) => {
      if (!slug) return
      navigate(
        `/pay/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(id)}`,
        { replace: true },
      )
    },
    [navigate, slug],
  )

  const handlePayOnBase = async () => {
    if (!canInteract || !resource) return
    setManualAdvancedOpen(false)
    const href = buildBaseUsdcEip681Link(resource)
    if (!href) {
      setAttemptError(
        "Pay on Base isn’t available for this resource (check payout address and USDC on Base).",
      )
      return
    }
    const id = await createAttempt()
    if (!id) return
    openPayUrlWithAttempt(id)
    window.location.href = href
  }

  const handlePayOnMetaMask = async () => {
    if (!canInteract || !resource) return
    setManualAdvancedOpen(false)
    const href = buildMetaMaskUsdcSendLink(resource)
    if (!href) {
      setAttemptError(
        "MetaMask pay isn’t available for this resource (check payout address and USDC on Base).",
      )
      return
    }
    const id = await createAttempt()
    if (!id) return
    openPayUrlWithAttempt(id)
    window.location.href = href
  }

  const handleOpenAdvancedManual = () => {
    setVerifyError(null)
    setAttemptError(null)
    setManualAdvancedOpen(true)
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

  const basePayHref =
    resource != null ? buildBaseUsdcEip681Link(resource) : null
  const metaMaskPayHref =
    resource != null ? buildMetaMaskUsdcSendLink(resource) : null

  const showAdvancedOnlyPanel = manualAdvancedOpen && resource != null

  const showMethodSelector = loadState === "done" && !showResourceSkeleton

  const showAdvancedTxToggle =
    loadState === "done" && !showResourceSkeleton && !manualAdvancedOpen

  const showWalletFollowUp =
    Boolean(attemptId && resource && !manualAdvancedOpen)

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
        on Base to the recipient for this link. The server detects USDC on Base
        automatically when you open the status page; use this form only if you
        need to force verification with a known transaction hash (e.g. from
        MetaMask or a block explorer).
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
      style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
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
                  Pay on Base opens Coinbase Wallet or the Base app. Pay on
                  MetaMask opens the MetaMask app. USDC on Base is detected
                  automatically when you check payment status—use Advanced only
                  if you need to paste a transaction hash.
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

                {showMethodSelector ? (
                  <VStack gap={2} alignItems="stretch">
                    <TextCaption color="fgMuted" fontWeight="label1" as="p">
                      Payment method
                    </TextCaption>
                    <Button variant="secondary" disabled block>
                      Pay with card
                    </Button>
                    <TextCaption color="fgMuted" as="p">
                      Card checkout is coming soon—no charge yet.
                    </TextCaption>
                    <Button
                      variant="secondary"
                      onClick={handlePayOnBase}
                      disabled={
                        !canInteract ||
                        isCreatingAttempt ||
                        !basePayHref
                      }
                      block
                    >
                      {isCreatingAttempt ? "Working…" : "Pay on Base"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handlePayOnMetaMask}
                      disabled={
                        !canInteract ||
                        isCreatingAttempt ||
                        !metaMaskPayHref
                      }
                      block
                    >
                      {isCreatingAttempt ? "Working…" : "Pay on MetaMask"}
                    </Button>
                    {!basePayHref && !metaMaskPayHref && resource ? (
                      <TextCaption color="fgMuted" as="p">
                        Wallet links are unavailable (no payout address on Base
                        for this resource). Use Advanced to verify with a
                        transaction hash.
                      </TextCaption>
                    ) : null}
                  </VStack>
                ) : null}

                {showWalletFollowUp ? (
                  <Box
                    bordered
                    borderRadius={400}
                    background="bgSecondary"
                    padding={{ base: 3, desktop: 4 }}
                  >
                    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
                      <TextCaption color="fgMuted" fontWeight="label1" as="p">
                        Payment in progress
                      </TextCaption>
                      <TextBody color="fgMuted" as="p">
                        After you send USDC on Base, open payment status. You can
                        tap Pay on Base or Pay on MetaMask again if you need to
                        reopen your wallet.
                      </TextBody>
                      {attemptId ? (
                        <TextBody mono as="code" color="fgMuted" overflow="wrap">
                          attemptId: {attemptId}
                        </TextBody>
                      ) : null}
                      <Button
                        variant="primary"
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

                {manualAdvancedOpen ? (
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
