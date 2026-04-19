import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle2,
  TextTitle3,
  TextTitle4,
} from "@coinbase/cds-web/typography"
import { createPaymentAttempt, fetchResource, type ApiResource } from "@/lib/api"
import { buildBaseUsdcEip681Link } from "@/lib/baseUsdcPayLink"
import { decodeQrFromImageFile } from "@/lib/decodeQrFromImageFile"
import {
  openPaidResource,
  resolvePaidNavigateUrl,
} from "@/lib/paidResourceUnlock"

type BuyFlowState = "idle" | "loading" | "loaded" | "paying" | "paid" | "error"

type BuyErrorPhase = "load" | "pay"

export type BuyFlowPanelVariant = "page" | "rail"

function extractSlugFrom402Input(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed)
      const parts = u.pathname.split("/").filter(Boolean)
      const payAt = parts.indexOf("pay")
      if (payAt >= 0 && parts[payAt + 1]) {
        return decodeURIComponent(parts[payAt + 1]!)
      }
    } catch {
      return null
    }
    return null
  }

  const slug = trimmed.replace(/^\/+|\/+$/g, "")
  return slug || null
}

function paidPayloadForDisplay(type: string, value: unknown): unknown {
  if (type.toLowerCase() === "json" && value !== null && typeof value === "object") {
    return value
  }
  return value
}

const railInputSurface = {
  bordered: false,
  focusedBorderWidth: 100 as const,
  inputBackground: "bgSecondary" as const,
} as const

type BuyFlowPanelProps = {
  variant?: BuyFlowPanelVariant
}

export function BuyFlowPanel({ variant = "page" }: BuyFlowPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isRail = variant === "rail"
  const showMobileQrScan = useMediaQuery("(max-width: 767px)")
  const qrFileInputRef = useRef<HTMLInputElement>(null)
  const [qrScanError, setQrScanError] = useState<string | null>(null)
  const [paste, setPaste] = useState("")
  const [state, setState] = useState<BuyFlowState>("idle")
  const [errorPhase, setErrorPhase] = useState<BuyErrorPhase | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [slug, setSlug] = useState<string | null>(null)
  const [resource, setResource] = useState<ApiResource | null>(null)
  const [paidValue, setPaidValue] = useState<unknown>(null)
  const [paidType, setPaidType] = useState<string>("json")

  const paidNavigableUrl = useMemo(() => {
    if (state !== "paid") return null
    return resolvePaidNavigateUrl(paidType, paidValue)
  }, [state, paidType, paidValue])

  /** Brief success UI, then same-tab navigation (better on mobile than `window.open` after async pay). */
  useEffect(() => {
    if (state !== "paid") return
    const url = resolvePaidNavigateUrl(paidType, paidValue)
    if (!url) return
    const id = window.setTimeout(() => {
      window.location.assign(url)
    }, 500)
    return () => window.clearTimeout(id)
  }, [state, paidType, paidValue])

  const clearErrors = useCallback(() => {
    setErrorPhase(null)
    setErrorMessage("")
  }, [])

  const setFlowError = useCallback((phase: BuyErrorPhase, message: string) => {
    setErrorPhase(phase)
    setErrorMessage(message)
    setState("error")
  }, [])

  const resetToIdle = useCallback(() => {
    clearErrors()
    setState("idle")
    setSlug(null)
    setResource(null)
    setPaidValue(null)
    setPaidType("json")
    setPaste("")
    setQrScanError(null)
  }, [clearErrors])

  const onPasteChange = useCallback((value: string) => {
    setQrScanError(null)
    setPaste(value)
  }, [])

  const handleQrFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      setQrScanError(null)
      try {
        const text = await decodeQrFromImageFile(file)
        if (!text) {
          setQrScanError(t("buy.qrScanFailed"))
          return
        }
        setPaste(text)
      } catch {
        setQrScanError(t("buy.qrScanFailed"))
      }
    },
    [t],
  )

  const handleLoad = useCallback(async () => {
    clearErrors()
    setQrScanError(null)
    const s = extractSlugFrom402Input(paste)
    if (!s) {
      setResource(null)
      setSlug(null)
      setPaidValue(null)
      setPaidType("json")
      setFlowError("load", t("buy.slugInvalid"))
      return
    }

    setState("loading")
    setResource(null)
    setSlug(s)
    setPaidValue(null)
    setPaidType("json")

    try {
      const data = await fetchResource(s)
      if (!data.ok || !data.resource) {
        setFlowError("load", data.error?.trim() || t("buy.loadFailed"))
        setResource(null)
        setSlug(null)
        return
      }
      setResource(data.resource)
      setState("loaded")
    } catch {
      setFlowError("load", t("buy.loadFailed"))
      setResource(null)
      setSlug(null)
    }
  }, [clearErrors, paste, setFlowError, t])

  const handlePay = useCallback(async () => {
    if (!slug || !resource) return
    clearErrors()

    const walletHref = buildBaseUsdcEip681Link(resource)
    if (!walletHref) {
      setFlowError("pay", t("pay.payBaseUnavailable"))
      return
    }

    setState("paying")

    try {
      const { response: attemptRes, data: attemptData } =
        await createPaymentAttempt({
          slug,
          clientType: "browser",
        })

      if (!attemptRes.ok || !attemptData?.ok || !attemptData.attemptId) {
        throw new Error(attemptData?.error?.trim() || t("buy.payFailed"))
      }

      const attemptId = attemptData.attemptId
      navigate(
        `/pay/${encodeURIComponent(slug)}?attemptId=${encodeURIComponent(attemptId)}`,
        { replace: true },
      )
      window.location.href = walletHref
    } catch (err) {
      const message = err instanceof Error ? err.message : t("buy.payFailed")
      setFlowError("pay", message)
      setState("loaded")
    }
  }, [clearErrors, navigate, resource, setFlowError, slug, t])

  const handleRetry = useCallback(() => {
    if (errorPhase === "load") {
      void handleLoad()
      return
    }
    if (errorPhase === "pay") {
      void handlePay()
    }
  }, [errorPhase, handleLoad, handlePay])

  const preMaxHeight = isRail ? 220 : 360

  const mobileQrCaptureBlock =
    showMobileQrScan ? (
      <VStack gap={2} alignItems="stretch" width="100%">
        <input
          ref={qrFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleQrFileChange(e)}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
            border: 0,
          }}
          tabIndex={-1}
          aria-hidden
        />
        <Button
          type="button"
          variant="secondary"
          startIcon="scanQrCode"
          onClick={() => qrFileInputRef.current?.click()}
          disabled={state === "loading"}
          block
        >
          {t("buy.scanQrWithCamera")}
        </Button>
        {qrScanError ? (
          <TextCaption color="fgNegative" as="p" style={{ margin: 0 }}>
            {qrScanError}
          </TextCaption>
        ) : null}
      </VStack>
    ) : null

  const inputBlock = isRail ? (
    <VStack gap={4} alignItems="stretch" width="100%">
      <TextInput
        compact
        {...railInputSurface}
        label={t("buy.railFieldLabel")}
        placeholder={t("buy.inputPlaceholder")}
        value={paste}
        onChange={(e) => onPasteChange(e.target.value)}
        autoComplete="off"
      />
      {mobileQrCaptureBlock}
      <VStack gap={2} alignItems="stretch" width="100%">
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleLoad()}
          disabled={state === "loading"}
          block
        >
          <HStack
            gap={2}
            alignItems="center"
            justifyContent="center"
            width="100%"
          >
            {state === "loading" ? (
              <Box className="buy-flow-spinner" aria-hidden />
            ) : null}
            {t("buy.load")}
          </HStack>
        </Button>
        <TextCaption color="fgMuted" as="p" style={{ margin: 0, textAlign: "center" }}>
          {t("buy.loadSupporting")}
        </TextCaption>
      </VStack>
    </VStack>
  ) : (
    <ContentCard>
      <ContentCardBody>
        <VStack gap={4} alignItems="stretch" width="100%">
          <TextInput
            label=""
            placeholder={t("buy.inputPlaceholder")}
            value={paste}
            onChange={(e) => onPasteChange(e.target.value)}
            autoComplete="off"
          />
          {mobileQrCaptureBlock}
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleLoad()}
            disabled={state === "loading"}
            block
          >
            <HStack
              gap={2}
              alignItems="center"
              justifyContent="center"
              width="100%"
            >
              {state === "loading" ? (
                <Box className="buy-flow-spinner" aria-hidden />
              ) : null}
              {t("buy.load")}
            </HStack>
          </Button>
          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("buy.loadSupporting")}
          </TextCaption>
        </VStack>
      </ContentCardBody>
    </ContentCard>
  )

  const errorBlock =
    state === "error" && errorPhase && errorMessage ? (
      <Box
        bordered
        borderRadius={400}
        background="bgSecondary"
        padding={4}
        width="100%"
      >
        <VStack gap={3} alignItems="stretch" width="100%">
          <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
            {errorMessage}
          </TextBody>
          {errorPhase === "pay" && resource ? (
            <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
              {resource.label}
            </TextCaption>
          ) : null}
          <HStack gap={2} alignItems="center" flexWrap="wrap">
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleRetry()}
              block={isRail}
            >
              {t("buy.errorRetry")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={resetToIdle}
              block={isRail}
            >
              {t("buy.errorStartOver")}
            </Button>
          </HStack>
        </VStack>
      </Box>
    ) : null

  const previewCard =
    state === "loaded" || state === "paying" ? (
      <ContentCard>
        <ContentCardHeader
          title={
            <TextTitle3 color="fg">{resource?.label ?? ""}</TextTitle3>
          }
        />
        <ContentCardBody>
          <VStack gap={4} alignItems="stretch">
            <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
              {resource
                ? `${resource.amount} ${resource.currency} • ${resource.network}`
                : ""}
            </TextBody>
            {state === "paying" ? (
              <HStack gap={2} alignItems="center">
                <Box className="buy-flow-spinner" aria-hidden />
                <TextCaption color="fgMuted" as="span">
                  {t("buy.paying")}
                </TextCaption>
              </HStack>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={() => void handlePay()}
                block={isRail}
              >
                {t("buy.payUnlock")}
              </Button>
            )}
          </VStack>
        </ContentCardBody>
      </ContentCard>
    ) : null

  const displayJson = JSON.stringify(
    paidPayloadForDisplay(paidType, paidValue),
    null,
    2,
  )

  const paidBlock =
    state === "paid" ? (
      <ContentCard>
        <ContentCardHeader
          title={<TextTitle3 color="fg">{t("buy.unlocked")}</TextTitle3>}
        />
        <ContentCardBody>
          <VStack gap={3} alignItems="stretch">
            {paidNavigableUrl ? (
              <>
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("buy.openingResource")}
                </TextBody>
                <TextCaption
                  color="fgMuted"
                  as="p"
                  style={{ margin: 0, wordBreak: "break-word" }}
                >
                  {paidNavigableUrl}
                </TextCaption>
              </>
            ) : (
              <Box
                as="pre"
                bordered
                borderRadius={300}
                background="bgSecondary"
                padding={3}
                style={{
                  margin: 0,
                  overflow: "auto",
                  maxHeight: preMaxHeight,
                  fontSize: 13,
                  lineHeight: 1.45,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {displayJson}
              </Box>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => openPaidResource(paidType, paidValue)}
              block={isRail}
            >
              {t("buy.openResource")}
            </Button>
            <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
              {paidNavigableUrl
                ? t("buy.unlockedSubNavHint")
                : t("buy.unlockedSub")}
            </TextCaption>
            <Button
              type="button"
              variant="secondary"
              onClick={resetToIdle}
              block={isRail}
            >
              {t("buy.unlockAnother")}
            </Button>
          </VStack>
        </ContentCardBody>
      </ContentCard>
    ) : null

  const showIdleChrome = state !== "paid"

  return (
    <VStack
      gap={isRail ? 5 : 7}
      alignItems="stretch"
      width="100%"
      minWidth={0}
      {...(!isRail
        ? { style: { maxWidth: 560, marginLeft: "auto", marginRight: "auto" } }
        : {})}
    >
      {showIdleChrome ? (
        !isRail ? (
          <VStack gap={3} alignItems="stretch">
            <TextTitle2 as="h1" color="fg" style={{ margin: 0 }}>
              {t("buy.heroTitle")}
            </TextTitle2>
            <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
              {t("buy.heroSub")}
            </TextBody>
          </VStack>
        ) : (
          <TextTitle4
            color="fg"
            as="p"
            style={{ margin: 0, lineHeight: 1.4, letterSpacing: "-0.02em" }}
          >
            {t("buy.railHeadline")}
          </TextTitle4>
        )
      ) : null}

      {showIdleChrome ? inputBlock : null}

      {errorBlock}
      {previewCard}
      {paidBlock}
    </VStack>
  )
}
