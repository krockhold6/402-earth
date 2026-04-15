import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { QRCodeCanvas } from "qrcode.react"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { createResource } from "@/lib/api"
import { useCdsColorScheme } from "@/providers/cdsColorSchemeContext"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { Carousel, CarouselItem } from "@coinbase/cds-web/carousel"
import { MessagingCard } from "@coinbase/cds-web/cards"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle1,
  TextTitle3,
} from "@coinbase/cds-web/typography"
import i18n from "@/i18n/config"

function validateCreatorReceiverAddress(raw: string):
  | { ok: true; normalized: string }
  | { ok: false; message: string } {
  const t = raw.trim()
  if (!t) {
    return {
      ok: false,
      message: i18n.t("validation.walletRequired"),
    }
  }
  if (!t.startsWith("0x")) {
    return { ok: false, message: i18n.t("validation.wallet0x") }
  }
  if (t.length !== 42) {
    return {
      ok: false,
      message: i18n.t("validation.walletLength"),
    }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(t)) {
    return {
      ok: false,
      message: i18n.t("validation.walletHex"),
    }
  }
  return { ok: true, normalized: t.toLowerCase() }
}

function pickResourceReceiver(resource: {
  receiverAddress?: string
  paymentReceiverAddress?: string | null
}): string {
  const a = resource.receiverAddress?.trim()
  if (a) return a
  const b = resource.paymentReceiverAddress?.trim()
  return b ?? ""
}

/** Same rule as worker `resource.ts` for custom slugs. */
const SLUG_CUSTOM_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function randomHexChars(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

function slugPrefixFromLabel(raw: string): string {
  let p = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!p) p = "link"
  if (!SLUG_CUSTOM_RE.test(p)) p = "link"
  return p
}

function fitSlugPrefix(prefix: string, suffix: string): string {
  const maxPrefix = 64 - 1 - suffix.length
  if (maxPrefix < 1) return "x"
  let p = prefix
  if (p.length > maxPrefix) {
    p = prefix.slice(0, maxPrefix).replace(/-+$/g, "")
    if (!p) p = "link"
  }
  if (!SLUG_CUSTOM_RE.test(p)) p = "link"
  if (p.length > maxPrefix) p = p.slice(0, maxPrefix).replace(/-+$/g, "") || "x"
  if (!SLUG_CUSTOM_RE.test(p)) return "pay"
  return p
}

function randomSlugFromLabel(labelRaw: string): string {
  const suffix = randomHexChars(4)
  const prefix = fitSlugPrefix(slugPrefixFromLabel(labelRaw), suffix)
  const candidate = `${prefix}-${suffix}`
  return SLUG_CUSTOM_RE.test(candidate) ? candidate : `pay-${randomHexChars(6)}`
}

function nextUniqueSlugFromLabel(
  labelRaw: string,
  used: Set<string>,
  currentField: string,
): string {
  const current = currentField.trim().toLowerCase()
  for (let i = 0; i < 48; i++) {
    const c = randomSlugFromLabel(labelRaw)
    if (used.has(c) || c === current) continue
    used.add(c)
    return c
  }
  let fallback: string
  do {
    fallback = `pay-${randomHexChars(8)}`
  } while (used.has(fallback) || fallback === current)
  used.add(fallback)
  return fallback
}

/**
 * Distance from viewport top for `position: sticky` on the QR column, below the
 * sticky `PageHeader` (~56px) plus a little air.
 */
const DESKTOP_QR_STICKY_TOP_PX = 64

/** Muted QR preview (empty state); canvas needs explicit hex, not CDS tokens. */
const ghostQrPalette = {
  light: { bg: "#f4f4f5", fg: "#d4d4d8" },
  dark: { bg: "#2b2b30", fg: "#5c5c66" },
} as const

const HOME_STEP_CARDS: ReadonlyArray<{
  id: string
  step: number
  titleKey: string
  descriptionKey: string
}> = [
  {
    id: "home-step-1",
    step: 1,
    titleKey: "home.step1Title",
    descriptionKey: "home.step1Description",
  },
  {
    id: "home-step-2",
    step: 2,
    titleKey: "home.step2Title",
    descriptionKey: "home.step2Description",
  },
  {
    id: "home-step-3",
    step: 3,
    titleKey: "home.step3Title",
    descriptionKey: "home.step3Description",
  },
]

/**
 * Step digit (1 / 2 / 3) shown on each carousel card — not the card surface itself.
 * Fill: CDS spectrum **Gray 0** (`rgb(var(--gray0))`), theme-aware in light/dark.
 */
function HomeStepNumberTag({ step }: { step: number }) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      width={56}
      height={56}
      flexShrink={0}
      borderRadius={400}
      dangerouslySetBackground="rgb(var(--gray0))"
      aria-label={i18n.t("home.stepBadgeAria", { step })}
    >
      <TextTitle1 as="span" color="fg" style={{ lineHeight: 1 }}>
        {step}
      </TextTitle1>
    </Box>
  )
}

/** Spans the full width of the grid column (viewport edge → vertical rule on wide). */
function HomeHorizontalRule() {
  return (
    <Box
      width="100%"
      maxWidth="100%"
      alignSelf="stretch"
      flexShrink={0}
      paddingY={4}
      display="flex"
      flexDirection="column"
    >
      <Divider
        background="bgLine"
        style={{
          flexShrink: 0,
          minHeight: 1,
          width: "100%",
          maxWidth: "100%",
          display: "block",
        }}
      />
    </Box>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const { colorScheme } = useCdsColorScheme()
  const isWide = useMediaQuery("(min-width: 960px)")
  const [amount, setAmount] = useState("5.00")
  const [label, setLabel] = useState("Exclusive video")
  /** Optional custom slug; empty means server generates on create. */
  const [slug, setSlug] = useState("")
  /** Creator payout wallet (USDC on Base); normalized to lowercase on submit. */
  const [receiverAddress, setReceiverAddress] = useState("")
  /** Inline validation for the wallet field (create flow). */
  const [receiverAddressError, setReceiverAddressError] = useState<
    string | null
  >(null)
  /** Set only after API confirms a resource exists (create). */
  const [paymentUrl, setPaymentUrl] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  /** Slugs produced by "Generate Random" (and successful creates) — never reused by the generator. */
  const usedGeneratedSlugsRef = useRef<Set<string>>(new Set())

  const slugKey = slug.trim()
  const hasQr = paymentUrl !== ""

  const invalidateQrIfFormChanged = useCallback(() => {
    setPaymentUrl("")
    setCreateError(null)
  }, [])

  const handleGenerateRandomSlug = useCallback(() => {
    const next = nextUniqueSlugFromLabel(
      label,
      usedGeneratedSlugsRef.current,
      slug,
    )
    setSlug(next)
    invalidateQrIfFormChanged()
  }, [invalidateQrIfFormChanged, label, slug])

  const handleCreatePaymentLink = async () => {
    setCreateError(null)
    setReceiverAddressError(null)

    const recvResult = validateCreatorReceiverAddress(receiverAddress)
    if (!recvResult.ok) {
      setReceiverAddressError(recvResult.message)
      return
    }

    const labelT = label.trim()
    const amountT = amount.trim()
    if (!labelT) {
      setCreateError(t("home.errorLabel"))
      return
    }
    if (!amountT) {
      setCreateError(t("home.errorAmount"))
      return
    }

    setIsCreating(true)
    try {
      const { response, data } = await createResource({
        label: labelT,
        amount: amountT,
        receiverAddress: recvResult.normalized,
        slug: slugKey || undefined,
      })

      if (!response.ok || !data?.ok || !data.resource || !data.paymentUrl) {
        const msg =
          data?.error?.trim() ||
          t("home.createErrorHttp", { status: response.status })
        setCreateError(msg)
        setPaymentUrl("")
        return
      }

      const createdSlug = data.resource.slug
      setSlug(createdSlug)
      usedGeneratedSlugsRef.current.add(createdSlug)
      setReceiverAddress(
        pickResourceReceiver(data.resource).toLowerCase() ||
          recvResult.normalized,
      )
      setPaymentUrl(data.paymentUrl)
      setCreateError(null)
      setReceiverAddressError(null)
    } catch {
      setCreateError(t("home.createErrorNetwork"))
      setPaymentUrl("")
    } finally {
      setIsCreating(false)
    }
  }

  const copyPaymentUrl = useCallback(async () => {
    if (!paymentUrl) return
    try {
      await navigator.clipboard.writeText(paymentUrl)
    } catch {
      /* unavailable */
    }
  }, [paymentUrl])

  const sharePayment = useCallback(async () => {
    if (!paymentUrl) return
    try {
      if (navigator.share) {
        await navigator.share({ title: label, text: label, url: paymentUrl })
        return
      }
      await navigator.clipboard.writeText(paymentUrl)
    } catch {
      /* cancelled or unavailable */
    }
  }, [label, paymentUrl])

  const downloadQr = useCallback(() => {
    const canvas = qrCanvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.href = canvas.toDataURL("image/png")
    a.download = `402-${slugKey || i18n.t("home.qrFilenamePayment")}.png`
    a.click()
  }, [slugKey])

  /** Viewport / outer edge inset for text and controls */
  const edgePad = { base: 3, desktop: 6 } as const
  /** Space before the vertical rule (wide) so blocks don’t touch the line */
  const ruleGap = 3 as const
  const padTop = { base: 4, desktop: 6 } as const
  const padBottom = { base: 5, desktop: 8 } as const

  const contentPadStart = edgePad
  const contentPadEnd = isWide ? ruleGap : edgePad

  const homeHero = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <Box
        as="h1"
        color="fg"
        font="headline"
        style={{
          fontSize: "85px",
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          margin: 0,
        }}
      >
        {t("home.hero1")}
        <br />
        {t("home.hero2")}
        <br />
        {t("home.hero3")}
      </Box>
    </Box>
  )

  const homeForm = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={3} alignItems="stretch" width="100%">
        <TextInput
          compact
          label={t("home.amount")}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            invalidateQrIfFormChanged()
          }}
          inputMode="decimal"
          autoComplete="off"
          suffix="USD"
        />
        <TextInput
          compact
          label={t("home.label")}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            invalidateQrIfFormChanged()
          }}
          autoComplete="off"
        />
        <VStack gap={1} alignItems="stretch">
          <TextInput
            compact
            label={t("home.receiverLabel")}
            value={receiverAddress}
            onChange={(e) => {
              setReceiverAddress(e.target.value)
              setReceiverAddressError(null)
              invalidateQrIfFormChanged()
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
          />
          <TextCaption color="fgMuted" as="p">
            {t("home.receiverHint")}
          </TextCaption>
          {receiverAddressError ? (
            <TextCaption color="fgNegative" as="p">
              {receiverAddressError}
            </TextCaption>
          ) : null}
        </VStack>
        <TextInput
          compact
          label={t("home.slugLabel")}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
            invalidateQrIfFormChanged()
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder={t("home.slugPlaceholder")}
          end={
            <Box
              display="flex"
              alignItems="center"
              paddingEnd={1}
              flexShrink={0}
            >
              <IconButton
                name="auto"
                variant="foregroundMuted"
                transparent
                compact
                type="button"
                accessibilityLabel={t("home.generateRandom")}
                onClick={(e) => {
                  e.stopPropagation()
                  handleGenerateRandomSlug()
                }}
                disabled={isCreating}
              />
            </Box>
          }
        />

        <Button
          block
          compact
          variant="primary"
          type="button"
          onClick={handleCreatePaymentLink}
          disabled={isCreating}
          minHeight={48}
          borderRadius={500}
        >
          {isCreating
            ? t("home.createLinkQrLoading")
            : t("home.createLinkQr")}
        </Button>

        {createError ? (
          <Box
            bordered
            borderRadius={400}
            background="bgNegativeWash"
            padding={3}
          >
            <TextBody color="fgNegative">{createError}</TextBody>
          </Box>
        ) : null}
      </VStack>
    </Box>
  )

  const homeSteps = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <Carousel
        width="100%"
        minWidth={0}
        snapMode="item"
        paginationVariant="dot"
        title={
          <Box flexGrow={1} minWidth={0} paddingEnd={2}>
            <TextTitle3 color="fg" as="h2">
              {t("home.stepsTitle")}
            </TextTitle3>
          </Box>
        }
        styles={{
          carousel: { gap: 16 },
          carouselContainer: { minWidth: 0 },
        }}
      >
        {HOME_STEP_CARDS.map(({ id, step, titleKey, descriptionKey }) => (
            <CarouselItem key={id} id={id}>
              <MessagingCard
                as="article"
                type="nudge"
                background="bgSecondary"
                tag={<HomeStepNumberTag step={step} />}
                title={t(titleKey)}
                description={
                  <TextBody as="p" color="fg">
                    {t(descriptionKey)}
                  </TextBody>
                }
                width={320}
                mediaPlacement="end"
                styles={{
                  mediaContainer: {
                    display: "none",
                  },
                  textContainer: {
                    gap: 12,
                  },
                }}
              />
            </CarouselItem>
        ))}
      </Carousel>
    </Box>
  )

  /** Wide: hero → form → steps (QR stays in the right column). */
  const leftPaneDesktop = (
    <VStack gap={0} alignItems="stretch" width="100%" maxWidth="100%">
      {homeHero}
      <HomeHorizontalRule />
      {homeForm}
      <HomeHorizontalRule />
      {homeSteps}
    </VStack>
  )

  const rightPanePaymentUrl = (
    <Box
      borderRadius={400}
      background="bgSecondary"
      padding={3}
      width="100%"
      minWidth={0}
      flexShrink={0}
    >
      <VStack gap={1} alignItems="stretch" minWidth={0}>
        <TextTitle3 color="fg" as="p">
          {t("home.paymentUrlTitle")}
        </TextTitle3>
        {!hasQr ? (
          <TextBody color="fgMuted" as="p">
            {t("home.paymentUrlEmpty")}
          </TextBody>
        ) : (
          <HStack
            gap={2}
            alignItems="flex-start"
            width="100%"
            minWidth={0}
          >
            <Box
              minWidth={0}
              style={{
                flex: "1 1 0%",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              <TextBody mono as="p" color="fg" style={{ margin: 0 }}>
                {paymentUrl}
              </TextBody>
            </Box>
            <Box flexShrink={0} display="flex" alignItems="center">
              <IconButton
                name="copy"
                variant="foregroundMuted"
                transparent
                compact
                type="button"
                accessibilityLabel={t("home.copyPaymentUrl")}
                onClick={copyPaymentUrl}
              />
            </Box>
          </HStack>
        )}
      </VStack>
    </Box>
  )

  const rightPane = (
    <Box
      display="flex"
      flexDirection="column"
      width="100%"
      height="100%"
      minHeight={0}
      style={{ flex: "1 1 0%", minHeight: 0 }}
    >
      <VStack gap={3} alignItems="center" width="100%" flexShrink={0}>
        <Box display="flex" justifyContent="center" width="100%" padding={2}>
          {!hasQr ? (
            <Box
              role="img"
              aria-label={t("home.qrPreviewAria")}
              style={{ lineHeight: 0 }}
            >
              <QRCodeCanvas
                value="https://402.placeholder/preview"
                size={220}
                marginSize={2}
                bgColor={ghostQrPalette[colorScheme].bg}
                fgColor={ghostQrPalette[colorScheme].fg}
              />
            </Box>
          ) : (
            <QRCodeCanvas
              ref={qrCanvasRef}
              value={paymentUrl}
              size={220}
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          )}
        </Box>
        <Box width="100%" maxWidth={350} alignSelf="center">
          <VStack gap={2} alignItems="stretch" width="100%">
            <Button
              block
              compact
              variant="primary"
              onClick={sharePayment}
              disabled={!hasQr}
              minHeight={48}
              borderRadius={500}
            >
              {t("home.share")}
            </Button>
            <Button
              block
              compact
              variant="secondary"
              onClick={downloadQr}
              disabled={!hasQr}
              minHeight={48}
              borderRadius={500}
            >
              {t("home.download")}
            </Button>
          </VStack>
        </Box>
      </VStack>
      <Box style={{ flex: "1 1 auto", minHeight: 12 }} aria-hidden />
      {rightPanePaymentUrl}
    </Box>
  )

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      background="bg"
      color="fg"
      minHeight={0}
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        ...(isWide ? { overflow: "hidden" } : { overflowY: "auto" }),
      }}
    >
      {isWide ? (
        <Grid
          width="100%"
          minHeight={0}
          templateColumns="minmax(0, 2fr) 1px minmax(0, 1fr)"
          rows={1}
          alignItems="stretch"
          columnGap={0}
          rowGap={0}
          style={{
            flex: "1 1 0%",
            minHeight: 0,
            gridTemplateRows: "minmax(0, 1fr)",
          }}
        >
          <GridColumn gridColumn="1 / 2" minWidth={0} minHeight={0}>
            <Box
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              paddingTop={padTop}
              paddingBottom={padBottom}
              style={{ overflowY: "auto" }}
            >
              {leftPaneDesktop}
            </Box>
          </GridColumn>

          <GridColumn
            gridColumn="2 / 3"
            display="flex"
            flexDirection="column"
            alignItems="stretch"
            alignSelf="stretch"
            minHeight={0}
            minWidth={0}
            padding={0}
          >
            <Divider
              direction="vertical"
              flexDirection="column"
              background="bgLine"
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                alignSelf: "stretch",
              }}
            />
          </GridColumn>

          <GridColumn gridColumn="3 / 4" minWidth={0} minHeight={0}>
            <Box
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              paddingStart={ruleGap}
              paddingEnd={edgePad}
              paddingTop={padTop}
              paddingBottom={padBottom}
              display="flex"
              flexDirection="column"
              alignItems="stretch"
              justifyContent="flex-start"
              style={{
                boxSizing: "border-box",
                position: "sticky",
                top: DESKTOP_QR_STICKY_TOP_PX,
                alignSelf: "start",
                maxHeight: `calc(100dvh - ${DESKTOP_QR_STICKY_TOP_PX}px)`,
                overflowY: "hidden",
              }}
            >
              {rightPane}
            </Box>
          </GridColumn>
        </Grid>
      ) : (
        <Box
          width="100%"
          paddingTop={padTop}
          paddingBottom={padBottom}
        >
          <VStack gap={0} alignItems="stretch" width="100%">
            {homeHero}
            <HomeHorizontalRule />
            {homeForm}
            <HomeHorizontalRule />
            <Box
              width="100%"
              paddingStart={contentPadStart}
              paddingEnd={contentPadEnd}
            >
              {rightPane}
            </Box>
            <HomeHorizontalRule />
            {homeSteps}
          </VStack>
        </Box>
      )}
    </Box>
  )
}
