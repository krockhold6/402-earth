import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
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
} from "@coinbase/cds-web/typography"
import {
  createPaymentAttempt,
  fetchPaidX402Resource,
  fetchResource,
  verifyX402Payment,
  type ApiResource,
} from "@/lib/api"

const DEV_MOCK_SIGNATURE = "browser-mock-signature"

type BuyFlowState = "idle" | "loading" | "loaded" | "paying" | "paid"

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

function openPaidResource(type: string, value: unknown): void {
  const t = type.toLowerCase()
  if (t === "link" && typeof value === "string") {
    window.open(value, "_blank", "noopener,noreferrer")
    return
  }
  if (t === "text" && typeof value === "string") {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" })
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
    return
  }
  const json = JSON.stringify(value, null, 2)
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer")
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
  const isRail = variant === "rail"
  const [paste, setPaste] = useState("")
  const [state, setState] = useState<BuyFlowState>("idle")
  const [slug, setSlug] = useState<string | null>(null)
  const [resource, setResource] = useState<ApiResource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [payError, setPayError] = useState<string | null>(null)
  const [paidValue, setPaidValue] = useState<unknown>(null)
  const [paidType, setPaidType] = useState<string>("json")

  const resetErrors = useCallback(() => {
    setLoadError(null)
    setPayError(null)
  }, [])

  const handleLoad = useCallback(async () => {
    resetErrors()
    const s = extractSlugFrom402Input(paste)
    if (!s) {
      setLoadError(t("buy.slugInvalid"))
      setState("idle")
      setResource(null)
      setSlug(null)
      setPaidValue(null)
      setPaidType("json")
      return
    }

    setState("loading")
    setResource(null)
    setSlug(s)
    setPaidValue(null)

    try {
      const data = await fetchResource(s)
      if (!data.ok || !data.resource) {
        setLoadError(data.error?.trim() || t("buy.loadFailed"))
        setState("idle")
        setResource(null)
        setSlug(null)
        return
      }
      setResource(data.resource)
      setState("loaded")
    } catch {
      setLoadError(t("buy.loadFailed"))
      setState("idle")
      setResource(null)
      setSlug(null)
    }
  }, [paste, resetErrors, t])

  const handlePay = useCallback(async () => {
    if (!slug || !resource) return
    resetErrors()
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

      const { response: verifyRes, data: verifyData } = await verifyX402Payment(
        {
          attemptId,
          slug,
          paymentSignature: DEV_MOCK_SIGNATURE,
        },
      )

      const verifyPaid =
        verifyRes.ok &&
        verifyData?.ok === true &&
        verifyData.status === "paid"

      if (!verifyPaid) {
        const { response: payRes, data: payData } = await fetchPaidX402Resource(
          slug,
          attemptId,
        )
        if (
          payRes.ok &&
          payData?.ok === true &&
          payData.status === "paid" &&
          payData.resource
        ) {
          setPaidType(payData.resource.type)
          setPaidValue(payData.resource.value)
          setState("paid")
          return
        }
        throw new Error(
          (verifyData?.error && verifyData.error.trim()) ||
            t("buy.payFailed"),
        )
      }

      const { response: payRes, data: payData } = await fetchPaidX402Resource(
        slug,
        attemptId,
      )

      if (
        !payRes.ok ||
        !payData?.ok ||
        payData.status !== "paid" ||
        !payData.resource
      ) {
        throw new Error(payData?.error?.trim() || t("buy.payFailed"))
      }

      setPaidType(payData.resource.type)
      setPaidValue(payData.resource.value)
      setState("paid")
    } catch (err) {
      const message = err instanceof Error ? err.message : t("buy.payFailed")
      setPayError(message)
      setState("loaded")
    }
  }, [resource, resetErrors, slug, t])

  const payPath =
    slug != null
      ? `/pay/${encodeURIComponent(slug)}`
      : "/pay/"

  const preMaxHeight = isRail ? 220 : 360

  const inputBlock = isRail ? (
    <VStack gap={3} alignItems="stretch" width="100%">
      <TextInput
        compact
        {...railInputSurface}
        label={t("buy.railFieldLabel")}
        placeholder={t("buy.inputPlaceholder")}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        autoComplete="off"
      />
      <HStack gap={2} alignItems="center" justifyContent="flex-end">
        {state === "loading" ? (
          <Box className="buy-flow-spinner" aria-hidden />
        ) : null}
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleLoad()}
          disabled={state === "loading"}
        >
          {t("buy.load")}
        </Button>
      </HStack>
    </VStack>
  ) : (
    <ContentCard>
      <ContentCardBody>
        <HStack gap={2} alignItems="flex-end" width="100%">
          <Box flexGrow={1} minWidth={0}>
            <TextInput
              label=""
              placeholder={t("buy.inputPlaceholder")}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              autoComplete="off"
            />
          </Box>
          <HStack gap={2} alignItems="center">
            {state === "loading" ? (
              <Box className="buy-flow-spinner" aria-hidden />
            ) : null}
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleLoad()}
              disabled={state === "loading"}
            >
              {t("buy.load")}
            </Button>
          </HStack>
        </HStack>
      </ContentCardBody>
    </ContentCard>
  )

  return (
    <VStack
      gap={isRail ? 4 : 5}
      alignItems="stretch"
      width="100%"
      minWidth={0}
      {...(!isRail
        ? { style: { maxWidth: 560, marginLeft: "auto", marginRight: "auto" } }
        : {})}
    >
      {!isRail ? (
        <VStack gap={2} alignItems="stretch">
          <TextTitle2 as="h1" color="fg" style={{ margin: 0 }}>
            {t("buy.heroTitle")}
          </TextTitle2>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("buy.heroSub")}
          </TextBody>
        </VStack>
      ) : (
        <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
          {t("buy.heroSub")}
        </TextCaption>
      )}

      {inputBlock}

      {loadError ? (
        <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
          {loadError}
        </TextBody>
      ) : null}

      {state === "loaded" || state === "paying" ? (
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
              {payError ? (
                <VStack gap={2} alignItems="stretch">
                  <TextBody color="fgNegative" as="p" style={{ margin: 0 }}>
                    {payError}
                  </TextBody>
                  <Button
                    as={Link}
                    to={payPath}
                    variant="secondary"
                    type="button"
                  >
                    {t("buy.openPayPage")}
                  </Button>
                </VStack>
              ) : null}
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
      ) : null}

      {state === "paid" ? (
        <ContentCard>
          <ContentCardHeader
            title={<TextTitle3 color="fg">{t("buy.unlocked")}</TextTitle3>}
            subtitle={
              <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                {t("buy.unlockedSub")}
              </TextCaption>
            }
          />
          <ContentCardBody>
            <VStack gap={3} alignItems="stretch">
              <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                {t("buy.codeBlockLabel")}
              </TextCaption>
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
                {JSON.stringify(paidValue, null, 2)}
              </Box>
              <Button
                type="button"
                variant="primary"
                onClick={() => openPaidResource(paidType, paidValue)}
                block={isRail}
              >
                {t("buy.openResource")}
              </Button>
            </VStack>
          </ContentCardBody>
        </ContentCard>
      ) : null}
    </VStack>
  )
}
