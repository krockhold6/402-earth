import { useCallback, useEffect, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
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

export default function Pay() {
  const { t } = useTranslation()
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
      setLoadError(t("pay.slugMissing"))
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
        setLoadError(data.error || t("pay.resourceNotFound"))
        return
      }
      setResource(data.resource)
      setLoadError(null)
    } catch {
      setResource(null)
      setLoadError(t("pay.loadFailed"))
    } finally {
      setLoadState("done")
    }
  }, [slug, t])

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
          data.error?.trim() || t("pay.attemptInvalid"),
        )
        return
      }
      if (data.attempt.slug !== slug) {
        setAttemptError(t("pay.attemptSlugMismatch"))
        return
      }
      setAttemptError(null)
      setAttemptId(attemptIdFromUrl)
    })()

    return () => {
      cancelled = true
    }
  }, [attemptIdFromUrl, loadError, loadState, resource, slug, t])

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
          attemptData?.error || t("pay.createAttemptFailed"),
        )
      }

      const id = attemptData.attemptId
      setAttemptId(id)
      return id
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("pay.unexpectedAttemptError")
      setAttemptError(message)
      return null
    } finally {
      setIsCreatingAttempt(false)
    }
  }, [attemptId, resource, slug, t])

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

  /** [EIP-681](https://eips.ethereum.org/EIPS/eip-681) — Base + USDC + amount + recipient; works with MetaMask, Coinbase Wallet, Base app, and other compatible wallets. */
  const handlePayWithWallet = async () => {
    if (!canInteract || !resource) return
    setManualAdvancedOpen(false)
    const href = buildBaseUsdcEip681Link(resource)
    if (!href) {
      setAttemptError(t("pay.payBaseUnavailable"))
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
      setVerifyError(t("pay.pasteTxHash"))
      return
    }
    if (!isLikelyTxHash(trimmed)) {
      setVerifyError(t("pay.txHashInvalid"))
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
          t("pay.verifyFailedHttp", { status: verifyRes.status })
        const code =
          verifyData?.code != null && String(verifyData.code).trim() !== ""
            ? ` (${String(verifyData.code).trim()})`
            : ""
        throw new Error(`${detail}${code}`.trim())
      }

      goToSuccess(attemptId)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("pay.unexpectedVerifyError")
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
          t("pay.mockVerifyFailedHttp", { status: verifyRes.status })
        const code =
          verifyData?.code != null && String(verifyData.code).trim() !== ""
            ? ` (${String(verifyData.code).trim()})`
            : ""
        throw new Error(`${detail}${code}`.trim())
      }

      goToSuccess(attemptId)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("pay.unexpectedVerifyError")
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

  const walletPayHref =
    resource != null ? buildBaseUsdcEip681Link(resource) : null

  const showAdvancedOnlyPanel = manualAdvancedOpen && resource != null

  /** Primary wallet CTA only when we have a payable resource and no active attempt flow. */
  const showWalletPrimarySection =
    loadState === "done" &&
    !showResourceSkeleton &&
    resource != null &&
    !attemptId &&
    !manualAdvancedOpen

  const showAdvancedTxToggle =
    loadState === "done" && !showResourceSkeleton && !manualAdvancedOpen

  const showWalletFollowUp =
    Boolean(attemptId && resource && !manualAdvancedOpen)

  const advancedTxForm = (opts: {
    title: string
    showBackToMethods: boolean
  }) => (
    <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
      <TextCaption color="fgMuted" fontWeight="label1" as="p">
        {opts.title}
      </TextCaption>
      <TextBody color="fgMuted" as="p">
        {t("pay.advancedInstruction", {
          amount: resource!.amount,
          currency: resource!.currency,
        })}
      </TextBody>

      {!attemptId ? (
        <Button
          onClick={handleManualPanelCreateAttempt}
          disabled={!canInteract || isCreatingAttempt}
          block
        >
          {isCreatingAttempt
            ? t("pay.createAttemptLoading")
            : t("pay.createAttempt")}
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
                {t("pay.paymentDetails")}
              </TextCaption>
              <TextBody color="fg">
                {t("pay.amountMinimum", {
                  amount: resource!.amount,
                  currency: resource!.currency,
                })}
              </TextBody>
              <TextBody color="fg">
                {t("pay.networkLabel", { network: resource!.network })}
              </TextBody>
              <TextBody color="fg">
                {t("pay.slugLabel", { slug: resource!.slug })}
              </TextBody>
              <TextBody mono as="code" color="fg" overflow="wrap">
                {t("pay.attemptIdLabel", { id: attemptId })}
              </TextBody>
            </VStack>
          </Box>
          <TextInput
            compact
            label={t("pay.txHash")}
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x…"
          />
          <Button
            onClick={handleVerifyWithTxHash}
            disabled={isVerifying}
            block
          >
            {isVerifying ? t("pay.verifyTxLoading") : t("pay.verifyTx")}
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
          {t("pay.backToOptions")}
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
            background="bgSecondary"
            padding={{ base: 3, desktop: 4 }}
            gap={{ base: 3, desktop: 4 }}
          >
            <ContentCardHeader
              title={<TextTitle3 color="fg">{t("pay.title")}</TextTitle3>}
              subtitle={
                <TextBody color="fgMuted" textAlign="center">
                  {t("pay.subtitle")}
                </TextBody>
              }
            />
            <ContentCardBody>
              <VStack gap={{ base: 3, desktop: 4 }} alignItems="stretch">
                <Box
                  bordered
                  borderRadius={400}
                  background={
                    resource && !showResourceError ? "bgElevation1" : "bgSecondary"
                  }
                  padding={{ base: 3, desktop: 4 }}
                >
                  <VStack gap={2} alignItems="stretch">
                    <TextCaption color="fgMuted" fontWeight="label1" as="p">
                      {t("pay.resource")}
                    </TextCaption>
                    {showResourceSkeleton ? (
                      <TextBody color="fgMuted">{t("pay.loading")}</TextBody>
                    ) : showResourceError ? (
                      <Box
                        bordered
                        borderRadius={400}
                        background="bgNegativeWash"
                        padding={3}
                      >
                        <VStack gap={2} alignItems="stretch">
                          <TextBody color="fgNegative">{loadError}</TextBody>
                          <Button
                            variant="secondary"
                            onClick={() => void load()}
                            block
                          >
                            {t("pay.retryLoad")}
                          </Button>
                        </VStack>
                      </Box>
                    ) : resource ? (
                      <>
                        <TextTitle3 color="fg">{resource.label}</TextTitle3>
                        <TextTitle1 color="fg">
                          {resource.amount} {resource.currency}
                        </TextTitle1>
                        <VStack gap={1} alignItems="stretch">
                          <TextBody color="fgMuted">
                            {t("pay.networkInline")}{" "}
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
                            {t("pay.slugCaption")} {resource.slug}
                          </TextCaption>
                        </VStack>
                      </>
                    ) : (
                      <TextBody color="fgMuted">{t("pay.noResource")}</TextBody>
                    )}
                  </VStack>
                </Box>

                {linkValidationPending ? (
                  <TextBody color="fgMuted" textAlign="center" as="p">
                    {t("pay.confirmingLink")}
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
                          {t("pay.openPayWithoutLink")}
                        </Button>
                      ) : null}
                    </VStack>
                  </Box>
                )}

                {showWalletPrimarySection ? (
                  <VStack gap={3} alignItems="stretch">
                    <Button
                      variant="primary"
                      onClick={handlePayWithWallet}
                      disabled={
                        !canInteract ||
                        isCreatingAttempt ||
                        !walletPayHref
                      }
                      block
                    >
                      {isCreatingAttempt
                        ? t("pay.working")
                        : t("pay.payWithWallet")}
                    </Button>
                    {walletPayHref ? (
                      <TextCaption color="fgMuted" textAlign="center" as="p">
                        {t("pay.payWithWalletHint")}
                      </TextCaption>
                    ) : null}
                    {!walletPayHref && resource ? (
                      <TextCaption color="fgMuted" textAlign="center" as="p">
                        {t("pay.walletLinksUnavailable")}
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
                        {t("pay.inProgress")}
                      </TextCaption>
                      <TextBody color="fgMuted" as="p">
                        {t("pay.inProgressBody")}
                      </TextBody>
                      {attemptId ? (
                        <TextBody mono as="code" color="fgMuted" overflow="wrap">
                          {t("pay.attemptIdLabel", { id: attemptId })}
                        </TextBody>
                      ) : null}
                      <Button
                        variant="primary"
                        onClick={() => attemptId && goToSuccess(attemptId)}
                        disabled={!attemptId}
                        block
                      >
                        {t("pay.viewStatus")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={resetToPaymentChoice}
                        disabled={isVerifying}
                        block
                      >
                        {t("pay.backToOptions")}
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
                              ? t("pay.hideAdvanced")
                              : t("pay.showAdvanced")}
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
                              label={t("pay.txHash")}
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
                                ? t("pay.verifyTxLoading")
                                : t("pay.verifyTx")}
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
                              {t("pay.developerShortcut")}
                            </TextCaption>
                            <TextBody color="fgMuted">
                              <Trans
                                i18nKey="pay.devMockBody"
                                components={{
                                  mono: (
                                    <TextBody as="span" mono color="fgMuted" />
                                  ),
                                }}
                              />
                            </TextBody>
                            <Button
                              variant="secondary"
                              onClick={handleDevMockVerify}
                              disabled={isVerifying}
                              block
                            >
                              {t("pay.devMockButton")}
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
                      title: t("pay.advancedTitle"),
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
                      {t("pay.advancedTitle")}
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
                      {t("pay.hideAdvancedBottom")}
                    </Button>
                  </Box>
                ) : null}

                <TextCaption color="fgMuted" textAlign="center" as="p">
                  {t("pay.statusApiNote")}
                </TextCaption>
              </VStack>
            </ContentCardBody>
          </ContentCard>
        </VStack>
      </Box>
    </Box>
  )
}
