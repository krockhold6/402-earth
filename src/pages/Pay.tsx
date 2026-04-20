import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import {
  createPaymentAttempt,
  fetchPaidX402Resource,
  fetchPaymentAttempt,
  fetchResource,
  verifyX402Payment,
  type ApiResource,
  type PaymentAttemptPayload,
} from "@/lib/api"
import {
  buildBaseUsdcEip681Link,
  formatUsdcAmountDisplay,
  isZeroUsdcAmount,
} from "@/lib/baseUsdcPayLink"
import {
  DesktopPayError,
  hasInjectedWalletProvider,
  sendBaseUsdcTransferFromBrowser,
} from "@/lib/desktopUsdcPay"
import { unlockPagePath } from "@/lib/appUrl"
import { qrCenterImageSettings } from "@/lib/qrCenterImageSettings"
import {
  openPaidResource,
  resolvePaidNavigateUrl,
} from "@/lib/paidResourceUnlock"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle1,
  TextTitle2,
} from "@coinbase/cds-web/typography"
import { QRCodeSVG } from "qrcode.react"

const DEV_MOCK_SIGNATURE = "browser-mock-signature"
const POLL_MS = 2500

const attemptStorageKey = (slug: string) => `402-earth:unlockAttempt:${slug}`
const walletHandoffKey = (attemptId: string) =>
  `402-earth:walletHandoff:${attemptId}`

function persistUnlockAttempt(slug: string, attemptId: string) {
  try {
    sessionStorage.setItem(attemptStorageKey(slug), attemptId)
  } catch {
    /* ignore */
  }
}

function clearUnlockAttempt(slug: string) {
  try {
    sessionStorage.removeItem(attemptStorageKey(slug))
  } catch {
    /* ignore */
  }
}

function setWalletHandoff(attemptId: string) {
  try {
    sessionStorage.setItem(walletHandoffKey(attemptId), "1")
  } catch {
    /* ignore */
  }
}

function readWalletHandoff(attemptId: string): boolean {
  try {
    return sessionStorage.getItem(walletHandoffKey(attemptId)) === "1"
  } catch {
    return false
  }
}

function clearWalletHandoff(attemptId: string) {
  try {
    sessionStorage.removeItem(walletHandoffKey(attemptId))
  } catch {
    /* ignore */
  }
}

function isLikelyTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim())
}

function terminalUnpaidStatus(status: string): boolean {
  return status === "failed" || status === "expired" || status === "cancelled"
}

type UnlockPhase =
  | "loading"
  | "awaiting_payment"
  | "payment_detected"
  | "tx_pending"
  | "confirming_unlock"
  | "access_granted"
  | "session_failed"

export default function Pay() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const attemptIdFromUrl = searchParams.get("attemptId")?.trim() || null
  const isMobilePayLayout = useMediaQuery("(max-width: 767px)")

  const [resource, setResource] = useState<ApiResource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "done">(
    "idle",
  )

  const [sessionStarting, setSessionStarting] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const [polledAttempt, setPolledAttempt] = useState<PaymentAttemptPayload | null>(
    null,
  )

  const [paidPayload, setPaidPayload] = useState<{
    type: string
    value: unknown
  } | null>(null)
  const [paidPayloadLoading, setPaidPayloadLoading] = useState(false)
  const [paidPayloadError, setPaidPayloadError] = useState<string | null>(null)
  const [deliveryRetryKey, setDeliveryRetryKey] = useState(0)

  const [manualAdvancedOpen, setManualAdvancedOpen] = useState(false)
  const [advancedHelpOpen, setAdvancedHelpOpen] = useState(false)
  const [cryptoAdvancedOpen, setCryptoAdvancedOpen] = useState(false)
  const [txHash, setTxHash] = useState("")

  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const [desktopTxSubmitted, setDesktopTxSubmitted] = useState(false)
  const [desktopPayBusy, setDesktopPayBusy] = useState(false)
  const [walletLinkCopied, setWalletLinkCopied] = useState(false)
  const [deliveryLinkCopied, setDeliveryLinkCopied] = useState(false)

  const autoOpenIssuedRef = useRef(false)

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
    setAdvancedHelpOpen(false)
    setCryptoAdvancedOpen(false)
    setTxHash("")
    setVerifyError(null)
    setSessionError(null)
    setSessionStarting(false)
    setPolledAttempt(null)
    setPaidPayload(null)
    setPaidPayloadError(null)
    setPaidPayloadLoading(false)
    setDeliveryRetryKey(0)
    autoOpenIssuedRef.current = false
    setDesktopTxSubmitted(false)
    setDesktopPayBusy(false)
    setWalletLinkCopied(false)
    setDeliveryLinkCopied(false)
  }, [slug])

  /** Create / resume payment attempt and sync ?attemptId= */
  useEffect(() => {
    if (loadState !== "done" || !slug || !resource || loadError) {
      return
    }

    let cancelled = false

    ;(async () => {
      setSessionError(null)

      if (attemptIdFromUrl) {
        const data = await fetchPaymentAttempt(attemptIdFromUrl)
        if (cancelled) return
        if (!data.ok || !data.attempt || data.attempt.slug !== slug) {
          navigate(unlockPagePath(slug), { replace: true })
          return
        }
        if (terminalUnpaidStatus(data.attempt.status)) {
          clearUnlockAttempt(slug)
          clearWalletHandoff(attemptIdFromUrl)
          navigate(unlockPagePath(slug), { replace: true })
          return
        }
        persistUnlockAttempt(slug, attemptIdFromUrl)
        setPolledAttempt(data.attempt)
        return
      }

      setSessionStarting(true)

      const stored = (() => {
        try {
          return sessionStorage.getItem(attemptStorageKey(slug))?.trim() || null
        } catch {
          return null
        }
      })()

      if (stored) {
        const data = await fetchPaymentAttempt(stored)
        if (cancelled) return
        if (
          data.ok &&
          data.attempt &&
          data.attempt.slug === slug &&
          !terminalUnpaidStatus(data.attempt.status)
        ) {
          persistUnlockAttempt(slug, stored)
          navigate(unlockPagePath(slug, stored), { replace: true })
          setPolledAttempt(data.attempt)
          setSessionStarting(false)
          return
        }
        clearUnlockAttempt(slug)
        if (stored) clearWalletHandoff(stored)
      }

      const { response: attemptRes, data: attemptData } =
        await createPaymentAttempt({
          slug,
          clientType: "browser",
        })
      if (cancelled) return
      if (!attemptRes.ok || !attemptData?.ok || !attemptData.attemptId) {
        setSessionError(
          attemptData?.error?.trim() || t("pay.createAttemptFailed"),
        )
        setSessionStarting(false)
        return
      }
      const id = attemptData.attemptId
      persistUnlockAttempt(slug, id)
      navigate(unlockPagePath(slug, id), { replace: true })
      const st = attemptData.status ?? "payment_required"
      const nowIso = new Date().toISOString()
      setPolledAttempt({
        id,
        slug,
        label: resource.label,
        amount: resource.amount,
        currency: resource.currency,
        network: resource.network,
        status: st,
        clientType: "browser",
        paymentMethod: "x402",
        payerAddress: null,
        paymentSignatureHash: null,
        txHash: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        paidAt: st === "paid" ? nowIso : null,
        expiresAt: null,
        paymentReceiverAddress: resource.receiverAddress ?? null,
      })
      setSessionStarting(false)
    })()

    return () => {
      cancelled = true
    }
  }, [attemptIdFromUrl, loadError, loadState, navigate, resource, slug, t])

  /** Poll attempt while session is active */
  useEffect(() => {
    if (!attemptIdFromUrl || !slug || !resource || loadError || sessionStarting) {
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const tick = async () => {
      const data = await fetchPaymentAttempt(attemptIdFromUrl)
      if (cancelled) return
      if (!data.ok || !data.attempt || data.attempt.slug !== slug) {
        return
      }
      setPolledAttempt(data.attempt)
      if (
        data.attempt.status === "paid" ||
        terminalUnpaidStatus(data.attempt.status)
      ) {
        if (timer !== undefined) {
          window.clearInterval(timer)
          timer = undefined
        }
      }
    }

    void tick()
    timer = window.setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [
    attemptIdFromUrl,
    loadError,
    resource,
    sessionStarting,
    slug,
  ])

  /** Load paid resource once attempt is paid */
  useEffect(() => {
    if (
      !attemptIdFromUrl ||
      !slug ||
      !polledAttempt ||
      polledAttempt.status !== "paid"
    ) {
      setPaidPayload(null)
      setPaidPayloadError(null)
      setPaidPayloadLoading(false)
      return
    }

    let cancelled = false
    setPaidPayload(null)
    setPaidPayloadError(null)
    setPaidPayloadLoading(true)

    ;(async () => {
      const { response, data } = await fetchPaidX402Resource(
        slug,
        attemptIdFromUrl,
      )
      if (cancelled) return
      setPaidPayloadLoading(false)
      if (
        response.ok &&
        data?.ok === true &&
        data.status === "paid" &&
        data.resource
      ) {
        setPaidPayload({
          type: data.resource.type,
          value: data.resource.value,
        })
        return
      }
      setPaidPayload(null)
      setPaidPayloadError(
        data?.error?.trim() ||
          t("pay.session.loadDeliveryFailed", { status: response.status }),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [attemptIdFromUrl, deliveryRetryKey, polledAttempt?.status, slug, t])

  useEffect(() => {
    if (polledAttempt?.status === "paid" && attemptIdFromUrl) {
      clearWalletHandoff(attemptIdFromUrl)
      setDesktopTxSubmitted(false)
    }
  }, [attemptIdFromUrl, polledAttempt?.status])

  const deliveryUrl = useMemo(() => {
    if (!paidPayload) return null
    return resolvePaidNavigateUrl(paidPayload.type, paidPayload.value)
  }, [paidPayload])

  const copyDeliveryUrl = useCallback(async () => {
    if (!deliveryUrl) return
    try {
      await navigator.clipboard.writeText(deliveryUrl)
      setDeliveryLinkCopied(true)
      window.setTimeout(() => setDeliveryLinkCopied(false), 2000)
    } catch {
      setVerifyError(t("pay.desktopCopyFailed"))
    }
  }, [deliveryUrl, t])

  const unlockPhase: UnlockPhase = useMemo(() => {
    if (loadState !== "done" || loadError || !resource) return "loading"
    if (sessionError) return "session_failed"
    if (sessionStarting || !attemptIdFromUrl) return "loading"
    if (!polledAttempt) return "loading"

    const st = polledAttempt.status

    if (terminalUnpaidStatus(st)) return "session_failed"

    if (st === "paid") {
      if (paidPayloadLoading || paidPayloadError) return "confirming_unlock"
      if (!paidPayload) return "confirming_unlock"
      return "access_granted"
    }

    if (desktopTxSubmitted && !terminalUnpaidStatus(st)) {
      return "tx_pending"
    }

    if (readWalletHandoff(attemptIdFromUrl)) return "payment_detected"

    return "awaiting_payment"
  }, [
    attemptIdFromUrl,
    desktopTxSubmitted,
    loadError,
    loadState,
    paidPayload,
    paidPayloadError,
    paidPayloadLoading,
    polledAttempt,
    resource,
    sessionError,
    sessionStarting,
  ])

  /** Auto-open delivery URL when access is ready */
  useEffect(() => {
    if (unlockPhase !== "access_granted" || !deliveryUrl || !paidPayload) return
    if (autoOpenIssuedRef.current) return
    autoOpenIssuedRef.current = true
    const id = window.setTimeout(() => {
      window.location.assign(deliveryUrl)
    }, 450)
    return () => window.clearTimeout(id)
  }, [deliveryUrl, paidPayload, unlockPhase])

  const resetToPaymentChoice = useCallback(() => {
    setManualAdvancedOpen(false)
    setAdvancedHelpOpen(false)
    setCryptoAdvancedOpen(false)
    setTxHash("")
    setVerifyError(null)
    if (slug) {
      if (attemptIdFromUrl) clearWalletHandoff(attemptIdFromUrl)
      clearUnlockAttempt(slug)
    }
    setPolledAttempt(null)
    setPaidPayload(null)
    setPaidPayloadError(null)
    autoOpenIssuedRef.current = false
    setDesktopTxSubmitted(false)
    if (slug) navigate(unlockPagePath(slug), { replace: true })
  }, [attemptIdFromUrl, navigate, slug])

  const handleOpenAdvancedManual = () => {
    setVerifyError(null)
    setSessionError(null)
    setAdvancedHelpOpen(false)
    setManualAdvancedOpen(true)
  }

  const handleVerifyWithTxHash = async () => {
    if (!slug || !attemptIdFromUrl || isVerifying) return

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
          attemptId: attemptIdFromUrl,
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

      const refreshed = await fetchPaymentAttempt(attemptIdFromUrl)
      if (refreshed.ok && refreshed.attempt) {
        setPolledAttempt(refreshed.attempt)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("pay.unexpectedVerifyError")
      setVerifyError(message)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleDevMockVerify = async () => {
    if (!slug || !attemptIdFromUrl || isVerifying) return

    setIsVerifying(true)
    setVerifyError(null)

    try {
      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId: attemptIdFromUrl,
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

      const refreshed = await fetchPaymentAttempt(attemptIdFromUrl)
      if (refreshed.ok && refreshed.attempt) {
        setPolledAttempt(refreshed.attempt)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("pay.unexpectedVerifyError")
      setVerifyError(message)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleOpenResource = () => {
    if (!paidPayload) return
    openPaidResource(paidPayload.type, paidPayload.value)
  }

  const showResourceSkeleton = loadState === "loading"
  const showResourceError = loadState === "done" && loadError

  const canInteract =
    Boolean(slug && resource && resource.active) &&
    loadState === "done" &&
    !loadError &&
    !sessionStarting &&
    Boolean(attemptIdFromUrl) &&
    !sessionError

  const isDev = import.meta.env.DEV

  const walletPayHref =
    resource != null ? buildBaseUsdcEip681Link(resource) : null

  const handleMobileDeepLinkPay = useCallback(() => {
    if (!canInteract || !resource || !attemptIdFromUrl) return
    setManualAdvancedOpen(false)
    const href = buildBaseUsdcEip681Link(resource)
    if (!href) {
      setSessionError(t("pay.payBaseUnavailable"))
      return
    }
    setWalletHandoff(attemptIdFromUrl)
    window.location.href = href
  }, [attemptIdFromUrl, canInteract, resource, t])

  const handleDesktopInBrowserPay = useCallback(async () => {
    if (
      !canInteract ||
      !resource ||
      !slug ||
      !attemptIdFromUrl ||
      isMobilePayLayout
    ) {
      return
    }
    setManualAdvancedOpen(false)
    setSessionError(null)
    setVerifyError(null)
    setDesktopPayBusy(true)
    try {
      const { txHash } = await sendBaseUsdcTransferFromBrowser(resource)
      setDesktopTxSubmitted(true)
      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId: attemptIdFromUrl,
          slug,
          txHash,
        },
      )
      const verifyOk =
        verifyRes.ok &&
        verifyData?.ok === true &&
        verifyData.status === "paid"
      if (verifyOk) {
        const refreshed = await fetchPaymentAttempt(attemptIdFromUrl)
        if (refreshed.ok && refreshed.attempt) {
          setPolledAttempt(refreshed.attempt)
        }
        return
      }
      const refreshed = await fetchPaymentAttempt(attemptIdFromUrl)
      if (refreshed.ok && refreshed.attempt) {
        setPolledAttempt(refreshed.attempt)
      }
    } catch (err) {
      if (err instanceof DesktopPayError) {
        if (err.code === "NO_WALLET") {
          setVerifyError(t("pay.desktopErrNoWallet"))
        } else if (err.code === "USER_REJECTED") {
          setVerifyError(t("pay.desktopErrRejected"))
        } else if (err.code === "INVALID_RESOURCE") {
          setSessionError(t("pay.payBaseUnavailable"))
        } else {
          setVerifyError(err.message || t("pay.unexpectedVerifyError"))
        }
      } else {
        setVerifyError(
          err instanceof Error ? err.message : t("pay.unexpectedVerifyError"),
        )
      }
    } finally {
      setDesktopPayBusy(false)
    }
  }, [
    attemptIdFromUrl,
    canInteract,
    isMobilePayLayout,
    resource,
    slug,
    t,
  ])

  const copyWalletPayLink = useCallback(async () => {
    const href =
      resource != null ? buildBaseUsdcEip681Link(resource) : null
    if (!href) return
    try {
      await navigator.clipboard.writeText(href)
      setWalletLinkCopied(true)
      window.setTimeout(() => setWalletLinkCopied(false), 2000)
    } catch {
      setVerifyError(t("pay.desktopCopyFailed"))
    }
  }, [resource, t])

  const handleEip681DeepLinkFallback = useCallback(() => {
    if (!canInteract || !resource || !attemptIdFromUrl) return
    const href = buildBaseUsdcEip681Link(resource)
    if (!href) {
      setSessionError(t("pay.payBaseUnavailable"))
      return
    }
    setWalletHandoff(attemptIdFromUrl)
    window.location.href = href
  }, [attemptIdFromUrl, canInteract, resource, t])

  const centerMeta =
    resource && !showResourceError && !showResourceSkeleton
      ? {
          isFree: isZeroUsdcAmount(resource.amount),
          amountDisplay: formatUsdcAmountDisplay(resource.amount),
        }
      : null

  const showAdvancedOnlyPanel =
    manualAdvancedOpen && resource != null && !centerMeta?.isFree

  const phaseCopy = useMemo(() => {
    switch (unlockPhase) {
      case "awaiting_payment":
        if (centerMeta?.isFree) {
          return {
            title: t("pay.freeUnlockingTitle"),
            subtitle: t("pay.freeUnlockingSubtitle"),
          }
        }
        return {
          title: t("pay.session.phase.awaitingTitle"),
          subtitle: t("pay.session.phase.awaitingSubtitle"),
        }
      case "payment_detected":
        return {
          title: t("pay.inProgressTitle"),
          subtitle: t("pay.inProgressShort"),
        }
      case "tx_pending":
        return {
          title: t("pay.session.phase.detectedTitle"),
          subtitle: t("pay.session.phase.detectedSubtitle"),
        }
      case "confirming_unlock":
        return {
          title: t("pay.session.phase.confirmingTitle"),
          subtitle: t("pay.session.phase.confirmingSubtitle"),
        }
      case "access_granted":
        return {
          title: t("pay.session.phase.accessTitle"),
          subtitle: t("pay.session.phase.accessSubtitle"),
        }
      case "session_failed":
        return {
          title: t("pay.session.phase.failedTitle"),
          subtitle: t("pay.session.phase.failedSubtitle"),
        }
      default:
        return {
          title: t("pay.session.phase.connectingTitle"),
          subtitle: t("pay.session.phase.connectingSubtitle"),
        }
    }
  }, [centerMeta?.isFree, t, unlockPhase])

  const showSessionCard =
    resource &&
    !showResourceError &&
    !showResourceSkeleton &&
    !sessionError &&
    (sessionStarting ||
      attemptIdFromUrl ||
      unlockPhase !== "loading")

  const showWalletPrimarySection =
    unlockPhase === "awaiting_payment" &&
    !manualAdvancedOpen &&
    Boolean(walletPayHref) &&
    !centerMeta?.isFree

  const showVerifyFallbackLink =
    unlockPhase === "awaiting_payment" &&
    !manualAdvancedOpen &&
    !centerMeta?.isFree

  const advancedTxForm = (opts: { showBackToMethods: boolean }) => (
    <VStack gap={{ base: 3, desktop: 4 }} alignItems="stretch">
      <VStack gap={1} alignItems="stretch">
        <TextTitle2 color="fg" as="h2" style={{ letterSpacing: "-0.02em" }}>
          {t("pay.verifySectionTitle")}
        </TextTitle2>
        <TextCaption color="fgMuted" as="p">
          {t("pay.verifyBrief")}
        </TextCaption>
      </VStack>

      <Box style={{ textAlign: "left" }}>
        <Button
          variant="foregroundMuted"
          onClick={() => setAdvancedHelpOpen((o) => !o)}
          block
        >
          {advancedHelpOpen
            ? t("pay.howItWorksHide")
            : t("pay.howItWorksShow")}
        </Button>
      </Box>

      {advancedHelpOpen ? (
        <TextBody color="fgMuted" as="p" style={{ textAlign: "left" }}>
          {t("pay.advancedInstructionDetail", {
            amount: resource!.amount,
            currency: resource!.currency,
          })}
        </TextBody>
      ) : null}

      {attemptIdFromUrl ? (
        <VStack gap={3} alignItems="stretch">
          <Box
            background="bgElevation1"
            borderRadius={400}
            padding={3}
            style={{ textAlign: "left" }}
          >
            <VStack gap={2} alignItems="stretch">
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
        </VStack>
      ) : null}

      {opts.showBackToMethods ? (
        <Button
          variant="foregroundMuted"
          onClick={resetToPaymentChoice}
          disabled={isVerifying}
          block
        >
          {t("pay.backToWalletPay")}
        </Button>
      ) : null}
    </VStack>
  )

  const useDesktopSplitPayLayout =
    Boolean(resource) &&
    !showResourceError &&
    !showResourceSkeleton &&
    showWalletPrimarySection &&
    !isMobilePayLayout

  const sessionCardTextAlign = useDesktopSplitPayLayout ? "left" : "center"

  const paymentErrBanner =
    sessionError || verifyError ? (
      <Box
        borderRadius={400}
        background="bgNegativeWash"
        padding={3}
        width="100%"
        style={{ textAlign: "left" }}
      >
        <VStack gap={2} alignItems="stretch">
          <TextBody color="fgNegative">{verifyError ?? sessionError}</TextBody>
          {sessionError && slug ? (
            <Button variant="secondary" onClick={resetToPaymentChoice} block>
              {t("pay.session.retrySession")}
            </Button>
          ) : null}
        </VStack>
      </Box>
    ) : null

  const paidPayloadErrBanner = paidPayloadError ? (
    <Box
      borderRadius={400}
      background="bgNegativeWash"
      padding={3}
      width="100%"
      style={{ textAlign: "left" }}
    >
      <VStack gap={2} alignItems="stretch">
        <TextBody color="fgNegative">{paidPayloadError}</TextBody>
        <Button
          variant="secondary"
          onClick={() => {
            setPaidPayloadError(null)
            setDeliveryRetryKey((k) => k + 1)
          }}
          block
        >
          {t("pay.session.retryDelivery")}
        </Button>
      </VStack>
    </Box>
  ) : null

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
        maxWidth={useDesktopSplitPayLayout ? "71rem" : "34rem"}
        paddingX={{ base: 3, desktop: 5 }}
        paddingY={{ base: 4, desktop: 6 }}
      >
        <VStack gap={{ base: 4, desktop: 5 }} alignItems="stretch">
          <VStack
            gap={{ base: 4, desktop: 5 }}
            alignItems="stretch"
            style={{ textAlign: "center" }}
          >
            {showResourceSkeleton ? (
              <TextBody color="fgMuted">{t("pay.loading")}</TextBody>
            ) : showResourceError ? (
              <Box
                borderRadius={400}
                background="bgNegativeWash"
                padding={3}
              >
                <VStack gap={3} alignItems="stretch">
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
              <VStack gap={{ base: 4, desktop: 5 }} alignItems="stretch">
                {useDesktopSplitPayLayout ? (
                  <Box
                    display="flex"
                    flexDirection="row"
                    gap={{ base: 4, desktop: 10 }}
                    alignItems="flex-start"
                    justifyContent="center"
                    width="100%"
                  >
                    <Box
                      style={{
                        flex: "1",
                        minWidth: 0,
                        maxWidth: "28rem",
                        textAlign: "left",
                      }}
                    >
                      <VStack gap={5} alignItems="stretch">
                      <VStack gap={1} alignItems="flex-start">
                        <TextCaption
                          color="fgMuted"
                          style={{
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                          }}
                        >
                          {centerMeta?.isFree
                            ? t("pay.freeUnlockEmphasis")
                            : t("pay.unlockEyebrow")}
                        </TextCaption>
                        <TextTitle2
                          color="fg"
                          as="h1"
                          style={{
                            letterSpacing: "-0.025em",
                            lineHeight: 1.15,
                            fontWeight: 600,
                          }}
                        >
                          {resource.label}
                        </TextTitle2>
                      </VStack>

                      <VStack gap={1} alignItems="flex-start">
                        {centerMeta?.isFree ? (
                          <>
                            <TextTitle1
                              color="fg"
                              style={{
                                fontSize: "clamp(1.85rem, 5.5vw, 2.65rem)",
                                fontWeight: 600,
                                letterSpacing: "-0.03em",
                                lineHeight: 1.1,
                              }}
                            >
                              {t("pay.freeUnlockEmphasis")}
                            </TextTitle1>
                            <TextCaption color="fgMuted" as="p">
                              {t("pay.freeUnlockSupporting", {
                                amount: centerMeta?.amountDisplay ?? "",
                                currency: resource.currency,
                                network: resource.network,
                              })}
                            </TextCaption>
                          </>
                        ) : (
                          <>
                            <HStack
                              gap={2}
                              alignItems="baseline"
                              style={{ flexWrap: "wrap" }}
                            >
                              <TextTitle1
                                color="fg"
                                style={{
                                  fontSize: "clamp(2rem, 6vw, 3.15rem)",
                                  fontWeight: 600,
                                  letterSpacing: "-0.035em",
                                  lineHeight: 1.08,
                                }}
                              >
                                {centerMeta?.amountDisplay}
                              </TextTitle1>
                              <TextTitle1
                                color="fgMuted"
                                style={{
                                  fontSize: "clamp(2rem, 6vw, 3.15rem)",
                                  fontWeight: 600,
                                  letterSpacing: "-0.035em",
                                  lineHeight: 1.08,
                                }}
                              >
                                {resource.currency}
                              </TextTitle1>
                            </HStack>
                            <TextCaption color="fgMuted" as="p">
                              {t("pay.paymentRequiredLine", {
                                amount: centerMeta?.amountDisplay ?? "",
                                currency: resource.currency,
                                network: resource.network,
                              })}
                            </TextCaption>
                          </>
                        )}
                      </VStack>

                      {showSessionCard ? (
                        <Box
                          borderRadius={400}
                          background={"bgSecondary"}
                          padding={{ base: 3, desktop: 4 }}
                          width="100%"
                          alignSelf="stretch"
                        >
                          <VStack gap={2} alignItems="stretch">
                            {sessionStarting ? (
                              <TextBody color="fgMuted" as="p">
                                {t("pay.session.starting")}
                              </TextBody>
                            ) : (
                              <>
                                <TextTitle2
                                  color="fg"
                                  as="h2"
                                  style={{
                                    letterSpacing: "-0.02em",
                                    textAlign: sessionCardTextAlign,
                                  }}
                                >
                                  {phaseCopy.title}
                                </TextTitle2>
                                <TextCaption
                                  color="fgMuted"
                                  as="p"
                                  style={{ textAlign: sessionCardTextAlign }}
                                >
                                  {phaseCopy.subtitle}
                                </TextCaption>
                              </>
                            )}
                          </VStack>
                        </Box>
                      ) : null}

                      {paymentErrBanner}
                      {paidPayloadErrBanner}

                      <VStack gap={3} alignItems="stretch" width="100%">
                        {showVerifyFallbackLink ? (
                          <Button
                            variant="primary"
                            onClick={handleOpenAdvancedManual}
                            disabled={!canInteract}
                            block
                          >
                            {t("pay.verifySecondaryLink")}
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          onClick={() => void handleDesktopInBrowserPay()}
                          disabled={
                            !canInteract ||
                            !walletPayHref ||
                            desktopPayBusy ||
                            !hasInjectedWalletProvider()
                          }
                          block
                        >
                          {desktopPayBusy
                            ? t("pay.working")
                            : centerMeta?.isFree
                              ? t("pay.desktopUnlockInBrowser")
                              : t("pay.desktopPayInBrowser")}
                        </Button>
                        {!hasInjectedWalletProvider() ? (
                          <TextCaption color="fgMuted" as="p">
                            {t("pay.desktopErrNoWallet")}
                          </TextCaption>
                        ) : null}
                        {walletPayHref ? (
                          <HStack
                            gap={2}
                            alignItems="stretch"
                            style={{ width: "100%" }}
                          >
                            <Button
                              variant="secondary"
                              onClick={() => void copyWalletPayLink()}
                              disabled={!canInteract}
                              block
                              style={{ flex: 1 }}
                            >
                              {walletLinkCopied
                                ? t("pay.desktopCopied")
                                : t("pay.desktopCopyLink")}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handleEip681DeepLinkFallback}
                              disabled={!canInteract || !walletPayHref}
                              block
                              style={{ flex: 1 }}
                            >
                              {t("pay.desktopOpenDeepLink")}
                            </Button>
                          </HStack>
                        ) : null}
                        {!walletPayHref ? (
                          <TextCaption color="fgMuted" as="p">
                            {t("pay.walletLinksUnavailableShort")}
                          </TextCaption>
                        ) : null}
                        <TextCaption color="fgMuted" as="p">
                          {t("pay.session.watchingHint")}
                        </TextCaption>
                        {walletPayHref ? (
                          <TextCaption color="fgMuted" as="p">
                            {t("pay.baseWalletsNote")}
                          </TextCaption>
                        ) : null}
                      </VStack>
                      </VStack>
                    </Box>

                    <VStack
                      gap={3}
                      alignItems="stretch"
                      flexShrink={0}
                      width="17.5rem"
                      style={{ position: "sticky", top: "6rem" }}
                    >
                      {walletPayHref ? (
                        <>
                          <Box
                            padding={3}
                            background="bg"
                            borderRadius={400}
                            alignSelf="center"
                            style={{ lineHeight: 0 }}
                          >
                            <QRCodeSVG
                              value={walletPayHref}
                              size={220}
                              level="H"
                              includeMargin={false}
                              imageSettings={qrCenterImageSettings(220)}
                            />
                          </Box>
                          <Box
                            background="bgSecondary"
                            borderRadius={400}
                            padding={3}
                            width="100%"
                          >
                            <TextBody color="fg" style={{ textAlign: "center" }}>
                              {t("pay.desktopQrCaption")}
                            </TextBody>
                          </Box>
                        </>
                      ) : (
                        <TextCaption color="fgMuted" as="p">
                          {t("pay.walletLinksUnavailableShort")}
                        </TextCaption>
                      )}
                    </VStack>
                  </Box>
                ) : (
                  <VStack gap={{ base: 4, desktop: 5 }} alignItems="center">
                    <VStack gap={1} alignItems="center" maxWidth="28rem">
                      <TextCaption
                        color="fgMuted"
                        style={{
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                        }}
                      >
                        {centerMeta?.isFree
                          ? t("pay.freeUnlockEmphasis")
                          : t("pay.unlockEyebrow")}
                      </TextCaption>
                      <TextTitle2
                        color="fg"
                        as="h1"
                        style={{
                          letterSpacing: "-0.025em",
                          lineHeight: 1.15,
                          fontWeight: 600,
                        }}
                      >
                        {resource.label}
                      </TextTitle2>
                    </VStack>

                    <VStack gap={1} alignItems="center">
                      {centerMeta?.isFree ? (
                        <>
                          <TextTitle1
                            color="fg"
                            style={{
                              fontSize: "clamp(1.85rem, 5.5vw, 2.65rem)",
                              fontWeight: 600,
                              letterSpacing: "-0.03em",
                              lineHeight: 1.1,
                            }}
                          >
                            {t("pay.freeUnlockEmphasis")}
                          </TextTitle1>
                          <TextCaption color="fgMuted" as="p">
                            {t("pay.freeUnlockSupporting", {
                              amount: centerMeta.amountDisplay,
                              currency: resource.currency,
                              network: resource.network,
                            })}
                          </TextCaption>
                        </>
                      ) : (
                        <>
                          <HStack
                            gap={2}
                            alignItems="baseline"
                            justifyContent="center"
                            style={{ flexWrap: "wrap" }}
                          >
                            <TextTitle1
                              color="fg"
                              style={{
                                fontSize: "clamp(2rem, 6vw, 3.15rem)",
                                fontWeight: 600,
                                letterSpacing: "-0.035em",
                                lineHeight: 1.08,
                              }}
                            >
                              {centerMeta?.amountDisplay}
                            </TextTitle1>
                            <TextTitle1
                              color="fgMuted"
                              style={{
                                fontSize: "clamp(2rem, 6vw, 3.15rem)",
                                fontWeight: 600,
                                letterSpacing: "-0.035em",
                                lineHeight: 1.08,
                              }}
                            >
                              {resource.currency}
                            </TextTitle1>
                          </HStack>
                          <TextCaption color="fgMuted" as="p">
                            {t("pay.paymentRequiredLine", {
                              amount: centerMeta?.amountDisplay ?? "",
                              currency: resource.currency,
                              network: resource.network,
                            })}
                          </TextCaption>
                        </>
                      )}
                    </VStack>

                    {showSessionCard ? (
                      <Box
                        borderRadius={400}
                        background={
                          unlockPhase === "access_granted"
                            ? "bgPositiveWash"
                            : unlockPhase === "session_failed"
                              ? "bgNegativeWash"
                              : "bgSecondary"
                        }
                        padding={{ base: 3, desktop: 4 }}
                        width="100%"
                        maxWidth="26rem"
                        alignSelf="center"
                      >
                        <VStack gap={2} alignItems="stretch">
                          {sessionStarting ? (
                            <TextBody color="fgMuted" as="p">
                              {t("pay.session.starting")}
                            </TextBody>
                          ) : (
                            <>
                              <TextTitle2
                                color="fg"
                                as="h2"
                                style={{
                                  letterSpacing: "-0.02em",
                                  textAlign: sessionCardTextAlign,
                                }}
                              >
                                {phaseCopy.title}
                              </TextTitle2>
                              <TextCaption
                                color="fgMuted"
                                as="p"
                                style={{ textAlign: sessionCardTextAlign }}
                              >
                                {phaseCopy.subtitle}
                              </TextCaption>
                            </>
                          )}
                        </VStack>
                      </Box>
                    ) : null}
                  </VStack>
                )}

                {!useDesktopSplitPayLayout ? paymentErrBanner : null}
                {!useDesktopSplitPayLayout ? paidPayloadErrBanner : null}

                {unlockPhase === "session_failed" && !sessionError ? (
                  <Button variant="primary" onClick={resetToPaymentChoice} block>
                    {t("pay.session.startNewUnlock")}
                  </Button>
                ) : null}

                {showWalletPrimarySection &&
                isMobilePayLayout &&
                !useDesktopSplitPayLayout ? (
                  <VStack gap={2} alignItems="center" maxWidth="26rem">
                    <TextCaption color="fgMuted" as="p">
                      {t("pay.session.watchingHint")}
                    </TextCaption>
                    {walletPayHref ? (
                      <TextCaption color="fgMuted" as="p">
                        {t("pay.baseWalletsNote")}
                      </TextCaption>
                    ) : null}
                  </VStack>
                ) : null}

                {showWalletPrimarySection &&
                isMobilePayLayout &&
                !useDesktopSplitPayLayout ? (
                  <Box
                    position="sticky"
                    bottom={0}
                    zIndex={2}
                    paddingTop={4}
                    background="bg"
                    style={{
                      marginTop: "1rem",
                      paddingBottom:
                        "max(20px, calc(16px + env(safe-area-inset-bottom)))",
                    }}
                  >
                    <VStack
                      gap={3}
                      alignItems="stretch"
                      width="100%"
                      maxWidth="26rem"
                      alignSelf="center"
                    >
                      <Button
                        variant="primary"
                        onClick={handleMobileDeepLinkPay}
                        disabled={!canInteract || !walletPayHref}
                        block
                      >
                        {t("pay.unlockInWallet")}
                      </Button>
                      {showVerifyFallbackLink ? (
                        <Button
                          variant="foregroundMuted"
                          onClick={handleOpenAdvancedManual}
                          disabled={!canInteract}
                          block
                        >
                          {t("pay.verifySecondaryLink")}
                        </Button>
                      ) : null}
                      {!walletPayHref ? (
                        <TextCaption color="fgMuted" as="p">
                          {t("pay.walletLinksUnavailableShort")}
                        </TextCaption>
                      ) : null}
                    </VStack>
                  </Box>
                ) : null}

                {!centerMeta?.isFree &&
                (unlockPhase === "payment_detected" ||
                  unlockPhase === "tx_pending" ||
                  unlockPhase === "confirming_unlock") &&
                !manualAdvancedOpen ? (
                  <VStack
                    gap={2}
                    alignItems="stretch"
                    width="100%"
                    maxWidth="26rem"
                    alignSelf="center"
                  >
                    <TextCaption color="fgMuted" as="p">
                      {t("pay.session.patienceHint")}
                    </TextCaption>
                    {isMobilePayLayout ? (
                      <Button
                        variant="foregroundMuted"
                        onClick={() => setCryptoAdvancedOpen((o) => !o)}
                        block
                      >
                        {cryptoAdvancedOpen
                          ? t("pay.hideAdvanced")
                          : t("pay.verifySecondaryLink")}
                      </Button>
                    ) : null}
                    {(cryptoAdvancedOpen ||
                      (!isMobilePayLayout &&
                        (unlockPhase === "payment_detected" ||
                          unlockPhase === "tx_pending" ||
                          unlockPhase === "confirming_unlock"))) &&
                    attemptIdFromUrl ? (
                      <Box
                        background="bgElevation1"
                        borderRadius={400}
                        padding={3}
                        style={{ textAlign: "left" }}
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
                    {isDev && attemptIdFromUrl ? (
                      <Box
                        background="bgElevation1"
                        borderRadius={400}
                        padding={3}
                        style={{ textAlign: "left" }}
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
                ) : null}

                {unlockPhase === "access_granted" && paidPayload ? (
                  <VStack
                    gap={3}
                    alignItems="stretch"
                    width="100%"
                    maxWidth="26rem"
                    alignSelf="center"
                  >
                    <Button variant="primary" onClick={handleOpenResource} block>
                      {t("pay.session.openResource")}
                    </Button>
                    {deliveryUrl ? (
                      <VStack gap={2} alignItems="stretch">
                        <Button
                          variant="secondary"
                          onClick={() => void copyDeliveryUrl()}
                          block
                        >
                          {deliveryLinkCopied
                            ? t("pay.desktopCopied")
                            : t("pay.copyDeliveryLink")}
                        </Button>
                        <TextCaption color="fgMuted" as="p">
                          {t("pay.deliveryQrCaption")}
                        </TextCaption>
                        <Box
                          alignSelf="center"
                          padding={2}
                          background="bg"
                          borderRadius={400}
                          style={{ lineHeight: 0 }}
                        >
                          <QRCodeSVG
                            value={deliveryUrl}
                            size={160}
                            level="H"
                            includeMargin={false}
                            imageSettings={qrCenterImageSettings(160)}
                          />
                        </Box>
                      </VStack>
                    ) : null}
                    <TextCaption color="fgMuted" as="p">
                      {t("pay.session.autoOpenFallback")}
                    </TextCaption>
                  </VStack>
                ) : null}

                {showAdvancedOnlyPanel ? (
                  <Box
                    width="100%"
                    maxWidth="26rem"
                    alignSelf="center"
                    style={{ textAlign: "left" }}
                  >
                    {advancedTxForm({ showBackToMethods: true })}
                  </Box>
                ) : null}
              </VStack>
            ) : (
              <TextBody color="fgMuted">{t("pay.noResource")}</TextBody>
            )}
          </VStack>
        </VStack>
      </Box>
    </Box>
  )
}
