import { useCallback, useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { absolutePayPageUrl } from "@/lib/appUrl"
import { createResource, fetchResource } from "@/lib/api"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, HStack, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"

/** Migration / placeholder receiver from older seeded rows — not a real payout address. */
const DEMO_ZERO_RECEIVER = "0x0000000000000000000000000000000000000000"

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

function receiverIsUsefulForPayout(address: string): boolean {
  const t = address.trim().toLowerCase()
  return t.length > 0 && t !== DEMO_ZERO_RECEIVER
}

/**
 * Distance from viewport top for `position: sticky` on the QR column, below the
 * sticky `PageHeader` (~56px) plus a little air.
 */
const DESKTOP_QR_STICKY_TOP_PX = 64

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
  /** Shown after loading demo-001 when the API has no real payout address. */
  const [demoWalletNotice, setDemoWalletNotice] = useState<string | null>(null)
  /** Set only after API confirms a resource exists (create or demo load). */
  const [paymentUrl, setPaymentUrl] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const slugKey = slug.trim()
  const hasQr = paymentUrl !== ""

  const invalidateQrIfFormChanged = useCallback(() => {
    setPaymentUrl("")
    setCreateError(null)
    setDemoWalletNotice(null)
  }, [])

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

      setSlug(data.resource.slug)
      setReceiverAddress(
        pickResourceReceiver(data.resource).toLowerCase() ||
          recvResult.normalized,
      )
      setPaymentUrl(data.paymentUrl)
      setCreateError(null)
      setReceiverAddressError(null)
      setDemoWalletNotice(null)
    } catch {
      setCreateError(
        "Network error — check your connection or API configuration.",
      )
      setPaymentUrl("")
    } finally {
      setIsCreating(false)
    }
  }

  const handleUseDemo001 = async () => {
    setCreateError(null)
    setIsCreating(true)
    try {
      const data = await fetchResource("demo-001")
      if (!data.ok || !data.resource) {
        setCreateError(
          data.error?.trim() ||
            "demo-001 was not found. Run the worker demo seed (demo_resource.sql) for local testing.",
        )
        setPaymentUrl("")
        setDemoWalletNotice(null)
        return
      }
      const r = data.resource
      setSlug("demo-001")
      setLabel(r.label)
      setAmount(r.amount)
      const recv = pickResourceReceiver(r)
      setReceiverAddress(recv ? recv.toLowerCase() : "")
      if (!receiverIsUsefulForPayout(recv)) {
        setDemoWalletNotice(
          "This demo resource doesn’t have a real payout wallet in the API (missing or placeholder address). You can still open the pay link to try the flow; on-chain payouts need a resource with a valid wallet.",
        )
      } else {
        setDemoWalletNotice(null)
      }
      setReceiverAddressError(null)
      setPaymentUrl(absolutePayPageUrl("demo-001"))
      setCreateError(null)
    } catch {
      setCreateError("Could not load demo-001 from the API.")
      setPaymentUrl("")
      setDemoWalletNotice(null)
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
          {demoWalletNotice ? (
            <Box
              bordered
              borderRadius={400}
              borderColor="bgLine"
              background="bgSecondary"
              padding={3}
            >
              <TextBody color="fgMuted" as="p">
                {demoWalletNotice}
              </TextBody>
            </Box>
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
          <HStack gap={2} alignItems="flex-end" flexWrap="wrap">
            <Box flexGrow={1} minWidth={0} flexBasis="12rem">
              <TextCaption color="fgMuted" as="p">
                Add your Base wallet above, then create a link — the QR uses the
                saved resource from the API. Leave slug empty for a random id,
                or choose one (letters, digits, hyphens). For a quick test
                without creating a row, use the seeded{" "}
                <TextBody as="span" mono color="fgMuted">
                  demo-001
                </TextBody>{" "}
                button.
              </TextCaption>
            </Box>
            <Button
              compact
              variant="secondary"
              type="button"
              onClick={handleUseDemo001}
              disabled={isCreating}
            >
              Use demo-001
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

  const homeHowItWorks = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextTitle3 color="fg" as="h2">
          How it works
        </TextTitle3>
        <TextBody color="fgMuted" as="p">
          {label}
        </TextBody>
      </VStack>
    </Box>
  )

  /** Wide: hero → form → how it works (QR stays in the right column). */
  const leftPaneDesktop = (
    <VStack gap={0} alignItems="stretch" width="100%" maxWidth="100%">
      {homeHero}
      <HomeHorizontalRule />
      {homeForm}
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
            Create a link or load demo-001 to show the URL and QR.
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
              width={220}
              height={220}
              display="flex"
              alignItems="center"
              justifyContent="center"
              bordered
              borderRadius={400}
              background="bgSecondary"
              padding={3}
            >
              <TextBody color="fgMuted" textAlign="center">
                Create a payment link to generate the QR code.
              </TextBody>
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
            {homeHowItWorks}
          </VStack>
        </Box>
      )}
    </Box>
  )
}
