import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { QRCodeCanvas } from "qrcode.react"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { TextInput } from "@coinbase/cds-web/controls"
import { Icon } from "@coinbase/cds-web/icons"
import { RemoteImage } from "@coinbase/cds-web/media"
import { createResource } from "@/lib/api"
import { publicUrl } from "@/lib/publicUrl"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { useTheme } from "@coinbase/cds-web/hooks/useTheme"
import { Interactable } from "@coinbase/cds-web/system/Interactable"
import { Carousel, CarouselItem } from "@coinbase/cds-web/carousel"
import { MessagingCard } from "@coinbase/cds-web/cards"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, HStack, VStack } from "@coinbase/cds-web/layout"
import type { IconName } from "@coinbase/cds-common/types"
import type { TabValue } from "@coinbase/cds-common/tabs/useTabs"
import { SegmentedTabs } from "@coinbase/cds-web/tabs"
import {
  Text,
  TextBody,
  TextCaption,
  TextLabel1,
  TextTitle2,
  TextTitle3,
  TextTitle4,
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

/** Golden ratio φ; left column : right column = φ : 1 (messaging side is wider). */
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2

/**
 * `MessagingCard` row defaults to flex with a non-shrinking media slot, which squeezes
 * copy on narrow cards. Grid tracks `φfr : 1fr` give the text column the larger share.
 * Used for Creators + Software audience carousels (`type="upsell"` for full-bleed media).
 */
const HOME_AUDIENCE_UPSELL_LAYOUT_STYLES = {
  layoutContainer: {
    display: "grid",
    gridTemplateColumns: `minmax(0, ${GOLDEN_RATIO}fr) minmax(0, 1fr)`,
    minWidth: 0,
    width: "100%",
  },
  contentContainer: {
    minWidth: 0,
    maxWidth: "100%",
  },
  mediaContainer: {
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
    alignSelf: "stretch",
    /** Overrides CDS default `alignItems: center` on the media `Box` so media can span card height. */
    alignItems: "stretch",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
} as const

/**
 * Distance from viewport top for `position: sticky` on the right transaction rail,
 * below the sticky `PageHeader` (~56px) plus a little air.
 */
const DESKTOP_QR_STICKY_TOP_PX = 64

/** Creators: spectrum Gray10 (matches “Background alternate” in light theme). */
const HOME_AUDIENCE_CREATORS_CARD_BG = "rgb(var(--gray10))"
/** Software: semantic inverse (= spectrum Gray100 role in each color scheme). */
const HOME_AUDIENCE_SOFTWARE_CARD_BG = "var(--color-bgInverse)"

type HomeAudienceMessagingCardRow = {
  id: string
  titleKey: string
  descriptionKey: string
  tagKey: string
  imageSrc: string
  /** Optional `object-position` for portrait or asymmetric art in the media slot. */
  imageObjectPosition?: string
}

const HOME_CREATORS_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-creators-1",
    titleKey: "home.creatorsCard1Title",
    descriptionKey: "home.creatorsCard1Description",
    tagKey: "home.creatorsCard1Tag",
    imageSrc: publicUrl("img/home-audience-creator-sell-links.png"),
    imageObjectPosition: "center 18%",
  },
  {
    id: "home-creators-2",
    titleKey: "home.creatorsCard2Title",
    descriptionKey: "home.creatorsCard2Description",
    tagKey: "home.creatorsCard2Tag",
    imageSrc: publicUrl("img/home-audience-creator-downloads.png"),
    imageObjectPosition: "center 42%",
  },
  {
    id: "home-creators-3",
    titleKey: "home.creatorsCard3Title",
    descriptionKey: "home.creatorsCard3Description",
    tagKey: "home.creatorsCard3Tag",
    imageSrc: publicUrl("img/home-audience-creator-content.png"),
    imageObjectPosition: "center 22%",
  },
  {
    id: "home-creators-4",
    titleKey: "home.creatorsCard4Title",
    descriptionKey: "home.creatorsCard4Description",
    tagKey: "home.creatorsCard4Tag",
    imageSrc: publicUrl("img/home-audience-creator-one-off-access.png"),
    imageObjectPosition: "center 38%",
  },
  {
    id: "home-creators-5",
    titleKey: "home.creatorsCard5Title",
    descriptionKey: "home.creatorsCard5Description",
    tagKey: "home.creatorsCard5Tag",
    imageSrc: publicUrl("img/home-audience-creator-social-drops.png"),
    imageObjectPosition: "center 38%",
  },
]

const HOME_SOFTWARE_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-software-1",
    titleKey: "home.softwareCard1Title",
    descriptionKey: "home.softwareCard1Description",
    tagKey: "home.softwareCard1Tag",
    imageSrc: publicUrl("img/home-audience-software-monetize-api.png"),
    imageObjectPosition: "46% center",
  },
  {
    id: "home-software-2",
    titleKey: "home.softwareCard2Title",
    descriptionKey: "home.softwareCard2Description",
    tagKey: "home.softwareCard2Tag",
    imageSrc: publicUrl("img/home-audience-software-actions.png"),
    imageObjectPosition: "center 44%",
  },
  {
    id: "home-software-3",
    titleKey: "home.softwareCard3Title",
    descriptionKey: "home.softwareCard3Description",
    tagKey: "home.softwareCard3Tag",
    imageSrc: publicUrl("img/home-audience-software-machine-readable.png"),
    imageObjectPosition: "center",
  },
]

function renderHomeAudienceMessagingCard(
  card: HomeAudienceMessagingCardRow,
  t: (key: string) => string,
  audience: "creators" | "software",
) {
  const titleText = t(card.titleKey)
  const isCreators = audience === "creators"
  const cardBackground = isCreators
    ? HOME_AUDIENCE_CREATORS_CARD_BG
    : HOME_AUDIENCE_SOFTWARE_CARD_BG
  const tagColor = isCreators ? "fgMuted" : "fgInverse"
  const titleColor = isCreators ? "fg" : "fgInverse"
  const descriptionColor = isCreators ? "fgMuted" : "fgInverse"
  return (
    <MessagingCard
      as="article"
      type="upsell"
      width={320}
      mediaPlacement="end"
      tag={
        <Text color={tagColor} font="label2">
          {t(card.tagKey)}
        </Text>
      }
      title={
        <Text color={titleColor} font="title3" as="span">
          {titleText}
        </Text>
      }
      description={
        <Text color={descriptionColor} font="label2" overflow="wrap">
          {t(card.descriptionKey)}
        </Text>
      }
      media={
        <RemoteImage
          alt={titleText}
          height="100%"
          width="100%"
          resizeMode="cover"
          shape="rectangle"
          source={card.imageSrc}
          style={{
            maxWidth: "100%",
            minHeight: "100%",
            height: "100%",
            objectPosition: card.imageObjectPosition ?? "center",
          }}
        />
      }
      styles={{
        root: {
          backgroundColor: cardBackground,
        },
        ...HOME_AUDIENCE_UPSELL_LAYOUT_STYLES,
        textContainer: { gap: 12 },
      }}
    />
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

/**
 * Coinbase-style list row: one `Interactable` control, primary icon disc + label,
 * hover/press wash via `blendStyles` (same interaction model as mobile money actions).
 */
function HomeLinkActionRow({
  iconName,
  label,
  onClick,
}: {
  iconName: IconName
  label: string
  onClick: () => void
}) {
  const theme = useTheme()
  return (
    <Interactable
      type="button"
      onClick={onClick}
      block
      borderRadius={400}
      paddingX={3}
      paddingY={2}
      background="bg"
      borderColor="bg"
      borderWidth={0}
      blendStyles={{
        hoveredBackground: theme.color.bgSecondaryWash,
        pressedBackground: theme.color.bgSecondary,
        hoveredOpacity: 1,
        pressedOpacity: 1,
      }}
      style={{
        border: "none",
        margin: 0,
        textAlign: "start",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <HStack gap={3} alignItems="center" width="100%" minWidth={0}>
        <Box
          aria-hidden
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          width={40}
          height={40}
          borderRadius={1000}
          background="bgPrimary"
        >
          <Icon name={iconName} size="s" color="fgInverse" />
        </Box>
        <TextLabel1
          as="span"
          color="fg"
          style={{ margin: 0, fontWeight: 700, textAlign: "start" }}
        >
          {label}
        </TextLabel1>
      </HStack>
    </Interactable>
  )
}

export default function Home() {
  const { t } = useTranslation()
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

  const why402ExampleLines = useMemo(
    () =>
      t("home.why402Examples")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [t],
  )

  type HomeRailTabId = "sell" | "buy" | "api"
  type HomeRailTab = { id: HomeRailTabId; label: string }

  const railTabs = useMemo<HomeRailTab[]>(
    () => [
      { id: "sell", label: t("home.railTabSell") },
      { id: "buy", label: t("home.railTabBuy") },
      { id: "api", label: t("home.railTabApi") },
    ],
    [t],
  )

  const [activeTab, updateActiveTab] = useState<HomeRailTab>(
    () => railTabs[0]!,
  )

  useEffect(() => {
    updateActiveTab((current) => {
      const next = railTabs.find((tab) => tab.id === current.id)
      return next ?? railTabs[0]!
    })
  }, [railTabs])

  const handleRailTabsChange = useCallback(
    (next: TabValue<HomeRailTabId> | null) => {
      if (!next) return
      const resolved = railTabs.find((tab) => tab.id === next.id)
      if (resolved) updateActiveTab(resolved)
    },
    [railTabs],
  )

  const canCreateOnRail = activeTab.id === "sell"

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
  const padBottom = { base: 8, desktop: 10 } as const
  /**
   * Right rail scrolls in a short viewport; extra bottom inset so the last control
   * isn’t tight against the scrollbar or viewport edge.
   */
  const rightWorkflowPadBottom = { base: 10, desktop: 10 } as const

  const contentPadStart = edgePad
  const contentPadEnd = isWide ? ruleGap : edgePad

  /** Horizontal inset for the workflow column body (divider sits outside this for full bleed). */
  const rightColumnInnerPad = isWide
    ? { paddingStart: ruleGap, paddingEnd: edgePad }
    : { paddingStart: edgePad, paddingEnd: edgePad }

  /** Headline only; audience blocks sit below `HomeHorizontalRule` like `homeWhy402`. */
  const homeHeroLead = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={5} alignItems="stretch" width="100%">
        <Box
          as="h1"
          color="fg"
          font="headline"
          style={{
            fontSize: "clamp(48px, 8vw, 85px)",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: 0,
            paddingBottom: 60,
          }}
        >
          {t("home.heroLine1")}
          <br />
          {t("home.heroLine2")}
        </Box>
      </VStack>
    </Box>
  )

  const homeDemoProofBand = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingBottom={{ base: 2, desktop: 3 }}
    >
      <Box
        borderRadius={400}
        background="bgSecondary"
        padding={{ base: 4, desktop: 5 }}
        width="100%"
        maxWidth={680}
      >
        <HStack
          justifyContent="space-between"
          alignItems="center"
          width="100%"
          minWidth={0}
          style={{ gap: "120px" }}
        >
          <Box minWidth={0} flexShrink={1} paddingEnd={3}>
            <TextTitle4 color="fg" as="p" style={{ margin: 0, lineHeight: 1.35 }}>
              {t("home.demoBandTitle")}
            </TextTitle4>
          </Box>
          <Box flexShrink={0}>
            <Button
              as={Link}
              to="/demo"
              compact
              variant="primary"
              type="button"
              borderRadius={500}
              minHeight={44}
            >
              {t("home.demoBandCta")}
            </Button>
          </Box>
        </HStack>
      </Box>
    </Box>
  )

  /** Carousel chrome for audience rows; cards use `MessagingCard` + `RemoteImage` media. */
  const homeAudienceCarouselStyles = {
    carousel: { gap: 16 },
    carouselContainer: { minWidth: 0 },
  } as const

  const homeAudienceCreatorsCarousel = (
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
              {t("home.audienceCreatorsTitle")}
            </TextTitle3>
          </Box>
        }
        styles={homeAudienceCarouselStyles}
      >
        {HOME_CREATORS_CARDS.map((card) => (
          <CarouselItem key={card.id} id={card.id}>
            {renderHomeAudienceMessagingCard(card, t, "creators")}
          </CarouselItem>
        ))}
      </Carousel>
    </Box>
  )

  const homeAudienceSoftwareCarousel = (
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
              {t("home.audienceSoftwareTitle")}
            </TextTitle3>
          </Box>
        }
        styles={homeAudienceCarouselStyles}
      >
        {HOME_SOFTWARE_CARDS.map((card) => (
          <CarouselItem key={card.id} id={card.id}>
            {renderHomeAudienceMessagingCard(card, t, "software")}
          </CarouselItem>
        ))}
      </Carousel>
    </Box>
  )

  /** Match `bgSecondary` cards / Payment URL; no stroke until focus (CDS `focusedBorderWidth`). */
  const homeFormTextInputSurface = {
    bordered: false,
    focusedBorderWidth: 100 as const,
    inputBackground: "bgSecondary" as const,
  } as const

  const homeRailSegmentedControl = (
    <SegmentedTabs<HomeRailTabId>
      accessibilityLabel={t("home.railModeLabel")}
      activeTab={activeTab}
      onChange={handleRailTabsChange}
      tabs={railTabs}
      alignSelf="flex-start"
      maxWidth="100%"
    />
  )

  const homeRailFlowSelector = (
    <HStack
      gap={1}
      alignItems="center"
      alignSelf="flex-start"
      borderRadius={500}
      background="bgSecondary"
      paddingY={2}
      paddingX={3}
      width="auto"
      maxWidth="100%"
    >
      <TextLabel1 color="fg" as="span">
        {t("home.flowOneTimePayment")}
      </TextLabel1>
      <Icon name="caretDown" size="s" color="fgMuted" />
    </HStack>
  )

  const visuallyHidden: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  }

  const homeRailAmountHero = (
    <Box
      as="label"
      htmlFor="home-rail-amount"
      width="100%"
      minWidth={0}
      display="block"
      position="relative"
    >
      <Box as="span" style={visuallyHidden}>
        {t("home.amount")}
      </Box>
      <HStack
        gap={3}
        alignItems="center"
        width="100%"
        minWidth={0}
        paddingY={2}
      >
        <Box position="relative" flexGrow={1} minWidth={0}>
          <Box
            as="input"
            id="home-rail-amount"
            value={amount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setAmount(e.target.value)
              invalidateQrIfFormChanged()
            }}
            inputMode="decimal"
            autoComplete="off"
            style={{
              display: "block",
              width: "100%",
              margin: 0,
              padding: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily:
                'CoinbaseSans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
              fontSize: "80px",
              textAlign: "left",
              color: "var(--color-fg)",
              caretColor: "var(--color-fgPrimary)",
              height: "68px",
            }}
          />
        </Box>
        <TextTitle3
          as="span"
          color="fgMuted"
          style={{ flexShrink: 0, lineHeight: 1 }}
        >
          USD
        </TextTitle3>
      </HStack>
    </Box>
  )

  const homeRailStackedFields = (
    <VStack gap={4} alignItems="stretch" width="100%">
      <TextInput
        compact
        {...homeFormTextInputSurface}
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
          {...homeFormTextInputSurface}
          label={t("home.getPaidAt")}
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
        <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
          {t("home.receiverHint")}
        </TextCaption>
        {receiverAddressError ? (
          <TextCaption color="fgNegative" as="p" style={{ margin: 0 }}>
            {receiverAddressError}
          </TextCaption>
        ) : null}
      </VStack>
      <TextInput
        compact
        {...homeFormTextInputSurface}
        label={t("home.slugRailLabel")}
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
    </VStack>
  )

  const homeFormSubmit = (
    <VStack gap={2} alignItems="stretch" width="100%">
      <Button
        block
        compact
        variant="primary"
        type="button"
        onClick={handleCreatePaymentLink}
        disabled={isCreating || !canCreateOnRail}
        minHeight={48}
        borderRadius={500}
        title={
          canCreateOnRail ? undefined : t("home.railCreateDisabledHint")
        }
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
  )

  const homeRailResultSection = hasQr ? (
    <VStack gap={3} alignItems="stretch" width="100%">
      <TextTitle4 color="fgMuted" as="p" style={{ margin: 0 }}>
        {t("home.railResultHeading")}
      </TextTitle4>
      <Box display="flex" justifyContent="center" width="100%">
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={paymentUrl}
          size={isWide ? 220 : 200}
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </Box>
      <Box
        borderRadius={400}
        background="bgSecondary"
        padding={4}
        width="100%"
        minWidth={0}
      >
        <VStack gap={2} alignItems="stretch" width="100%" minWidth={0}>
          <TextLabel1 color="fg" as="p" style={{ margin: 0 }}>
            {t("home.paymentUrlTitle")}
          </TextLabel1>
          <Box
            minWidth={0}
            style={{
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            <TextBody mono as="p" color="fg" style={{ margin: 0 }}>
              {paymentUrl}
            </TextBody>
          </Box>
        </VStack>
      </Box>
      <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
        <HomeLinkActionRow
          iconName="copy"
          label={t("home.copyPaymentUrl")}
          onClick={copyPaymentUrl}
        />
        <HomeLinkActionRow
          iconName="share"
          label={t("home.share")}
          onClick={sharePayment}
        />
        <HomeLinkActionRow
          iconName="download"
          label={t("home.download")}
          onClick={downloadQr}
        />
      </VStack>
    </VStack>
  ) : null

  const homeWhy402 = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingBottom={6}
    >
      <Box width="100%" maxWidth={680} minWidth={0}>
        <VStack gap={6} alignItems="stretch" width="100%">
          <VStack gap={3} alignItems="stretch" width="100%">
            <TextTitle2
              color="fg"
              as="h2"
              style={{ margin: 0, letterSpacing: "-0.02em" }}
            >
              {t("home.why402Heading")}
            </TextTitle2>
            <TextTitle4 color="fg" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
              {t("home.why402Tagline")}
            </TextTitle4>
          </VStack>
          <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.6 }}>
            {t("home.why402Lead")}
          </TextBody>
          <Box
            as="ul"
            margin={0}
            paddingStart={4}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              listStyleType: "disc",
            }}
          >
            {why402ExampleLines.map((line, i) => (
              <Box as="li" key={i} style={{ margin: 0 }}>
                <TextBody color="fgMuted" as="span" style={{ lineHeight: 1.55 }}>
                  {line}
                </TextBody>
              </Box>
            ))}
          </Box>
          <VStack gap={2} alignItems="stretch" width="100%">
            <TextBody color="fg" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
              {t("home.why402Built")}
            </TextBody>
            <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.6 }}>
              {t("home.why402Closer")}
            </TextBody>
          </VStack>
          <VStack gap={5} alignItems="stretch" width="100%">
            <VStack gap={1} alignItems="stretch" width="100%">
              <TextTitle3 color="fg" as="h3" style={{ margin: 0 }}>
                {t("home.why402EverydayTitle")}
              </TextTitle3>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                {t("home.why402EverydayBody")}
              </TextBody>
            </VStack>
            <VStack gap={1} alignItems="stretch" width="100%">
              <TextTitle3 color="fg" as="h3" style={{ margin: 0 }}>
                {t("home.why402CreatorTitle")}
              </TextTitle3>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                {t("home.why402CreatorBody")}
              </TextBody>
            </VStack>
            <VStack gap={1} alignItems="stretch" width="100%">
              <TextTitle3 color="fg" as="h3" style={{ margin: 0 }}>
                {t("home.why402MachineTitle")}
              </TextTitle3>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.55 }}>
                {t("home.why402MachineBody")}
              </TextBody>
            </VStack>
          </VStack>
        </VStack>
      </Box>
    </Box>
  )

  /** Wide: lead → audience carousels → “Why 402”; form + output live in the right column. */
  const leftPaneDesktop = (
    <VStack gap={0} alignItems="stretch" width="100%" maxWidth="100%">
      {homeHeroLead}
      {homeDemoProofBand}
      <HomeHorizontalRule />
      {homeAudienceCreatorsCarousel}
      <HomeHorizontalRule />
      {homeAudienceSoftwareCarousel}
      <HomeHorizontalRule />
      {homeWhy402}
    </VStack>
  )

  /**
   * Transaction rail: mode → flow → amount → fields → CTA; generated QR/URL/share
   * live in `homeRailResultSection` below the CTA.
   */
  const rightPane = (
    <Box
      display="flex"
      flexDirection="column"
      width="100%"
      height="100%"
      minHeight={0}
      style={{ flex: "1 1 0%", minHeight: 0 }}
    >
      <Box width="100%" {...rightColumnInnerPad}>
        <VStack gap={5} alignItems="stretch" width="100%">
          {homeRailSegmentedControl}
          {homeRailFlowSelector}
          {homeRailAmountHero}
          {homeRailStackedFields}
          {homeFormSubmit}
          {homeRailResultSection}
        </VStack>
      </Box>
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
          templateColumns={`minmax(0, ${GOLDEN_RATIO}fr) 1px minmax(0, 1fr)`}
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
              paddingTop={padTop}
              paddingBottom={rightWorkflowPadBottom}
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
                overflowY: "auto",
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
            {homeHeroLead}
            {homeDemoProofBand}
            <HomeHorizontalRule />
            {homeAudienceCreatorsCarousel}
            <HomeHorizontalRule />
            {homeAudienceSoftwareCarousel}
            <HomeHorizontalRule />
            <Box width="100%" paddingBottom={rightWorkflowPadBottom}>
              {rightPane}
            </Box>
            <HomeHorizontalRule />
            {homeWhy402}
          </VStack>
        </Box>
      )}
    </Box>
  )
}
