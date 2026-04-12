import { useCallback, useMemo, useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Button } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextTitle3 } from "@coinbase/cds-web/typography"

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
  const [slug, setSlug] = useState("demo-001")
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const paymentUrl = useMemo(() => {
    const origin = window.location.origin
    return `${origin}/pay/${encodeURIComponent(slug)}`
  }, [slug])

  const sharePayment = useCallback(async () => {
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
    a.download = `402-${slug}.png`
    a.click()
  }, [slug])

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
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          suffix="USD"
        />
        <TextInput
          compact
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoComplete="off"
        />
        <TextInput
          compact
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Box
          bordered
          borderRadius={400}
          borderColor="bgLine"
          background="bgSecondary"
          padding={3}
        >
          <VStack gap={1} alignItems="stretch">
            <TextTitle3 color="fg" as="p">
              Payment URL
            </TextTitle3>
            <TextBody mono as="p" color="fg" overflow="wrap">
              {paymentUrl}
            </TextBody>
          </VStack>
        </Box>
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

  const rightPane = (
    <VStack gap={3} alignItems="center" width="100%">
      <Box display="flex" justifyContent="center" width="100%" padding={2}>
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={paymentUrl}
          size={220}
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </Box>
      <VStack gap={2} alignItems="stretch" width="100%">
        <Button
          block
          compact
          variant="primary"
          onClick={sharePayment}
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
          minHeight={48}
          borderRadius={500}
        >
          Download
        </Button>
      </VStack>
    </VStack>
  )

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      background="bg"
      color="fg"
      flexGrow={1}
      minHeight={0}
    >
      {isWide ? (
        <Grid
          width="100%"
          flexGrow={1}
          minHeight={0}
          templateColumns="minmax(0, 2fr) 1px minmax(0, 1fr)"
          rows={1}
          alignItems="stretch"
          columnGap={0}
          rowGap={0}
        >
          <GridColumn gridColumn="1 / 2" minWidth={0} minHeight={0}>
            <Box
              width="100%"
              height="100%"
              minWidth={0}
              paddingTop={padTop}
              paddingBottom={padBottom}
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
              paddingStart={ruleGap}
              paddingEnd={edgePad}
              paddingTop={padTop}
              paddingBottom={padBottom}
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
