import { useCallback, useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { createResource } from "@/lib/api"
import { useCdsColorScheme } from "@/providers/cdsColorSchemeContext"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"

function validateCreatorReceiverAddress(raw: string):
  | { ok: true; normalized: string }
  | { ok: false; message: string } {
  const t = raw.trim()
  if (!t) {
    return {
      ok: false,
      message: "Enter the wallet address where you want to get paid.",
    }
  }
  if (!t.startsWith("0x")) {
    return { ok: false, message: "Wallet address must start with 0x." }
  }
  if (t.length !== 42) {
    return {
      ok: false,
      message:
        "Wallet address must be 42 characters (0x plus 40 hexadecimal digits).",
    }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(t)) {
    return {
      ok: false,
      message: "Only the digits 0–9 and letters a–f are allowed after 0x.",
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
      setCreateError("Enter a label.")
      return
    }
    if (!amountT) {
      setCreateError("Enter an amount.")
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
          `Could not create resource (HTTP ${response.status}).`
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
      setCreateError(
        "Network error — check your connection or API configuration.",
      )
      setPaymentUrl("")
    } finally {
      setIsCreating(false)
    }
  }

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
    a.download = `402-${slugKey || "payment"}.png`
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
        Scan
        <br />
        Pay
        <br />
        Get Paid
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
          label="Amount"
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
          label="Label"
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
            label="Where should you get paid?"
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
            USDC on Base will be sent here
          </TextCaption>
          {receiverAddressError ? (
            <TextCaption color="fgNegative" as="p">
              {receiverAddressError}
            </TextCaption>
          ) : null}
        </VStack>
        <VStack gap={1} alignItems="stretch">
          <TextInput
            compact
            label="Slug (optional)"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              invalidateQrIfFormChanged()
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Leave empty for auto"
          />
          <HStack justifyContent="flex-end" width="100%">
            <Button
              compact
              variant="secondary"
              type="button"
              onClick={handleGenerateRandomSlug}
              disabled={isCreating}
            >
              Generate Random
            </Button>
          </HStack>
        </VStack>

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
          {isCreating ? "Creating…" : "Create payment link & QR"}
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

  const homeQuickGuide = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextTitle3 color="fg" as="h2">
          Quick guide
        </TextTitle3>
        <TextCaption color="fgMuted" as="p">
          Add your Base wallet above, then create a link — the QR uses the saved
          resource from the API. Leave slug empty for a random id, or choose one
          (letters, digits, hyphens).{" "}
          <TextBody as="span" fontWeight="label1" color="fgMuted">
            Generate Random
          </TextBody>{" "}
          builds a slug from your label; each click picks a new name and never
          repeats one you already used here in this session.
        </TextCaption>
      </VStack>
    </Box>
  )

  const homeHowItWorks = (
    <Box
      id="how-it-works"
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextTitle3 color="fg" as="h2">
          How it works
        </TextTitle3>
        <TextBody color="fgMuted" as="p">
          Share your pay link or QR. Buyers pay USDC on Base; funds go to the
          wallet on the resource, and they land on your success page for that
          slug.
        </TextBody>
      </VStack>
    </Box>
  )

  /** Wide: hero → form → quick guide → how it works (QR stays in the right column). */
  const leftPaneDesktop = (
    <VStack gap={0} alignItems="stretch" width="100%" maxWidth="100%">
      {homeHero}
      <HomeHorizontalRule />
      {homeForm}
      <HomeHorizontalRule />
      {homeQuickGuide}
      <HomeHorizontalRule />
      {homeHowItWorks}
    </VStack>
  )

  const rightPanePaymentUrl = (
    <Box
      bordered
      borderRadius={400}
      borderColor="bgLine"
      background="bgSecondary"
      padding={3}
      width="100%"
      flexShrink={0}
    >
      <VStack gap={1} alignItems="stretch">
        <TextTitle3 color="fg" as="p">
          Payment URL
        </TextTitle3>
        {!hasQr ? (
          <TextBody color="fgMuted" as="p">
            Create a link to show the URL and QR.
          </TextBody>
        ) : (
          <TextBody mono as="p" color="fg" overflow="wrap">
            {paymentUrl}
          </TextBody>
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
              aria-label="QR code preview; create a payment link to show your live code."
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
            Share
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
            Download
          </Button>
        </VStack>
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
            {homeQuickGuide}
            <HomeHorizontalRule />
            {homeHowItWorks}
          </VStack>
        </Box>
      )}
    </Box>
  )
}
