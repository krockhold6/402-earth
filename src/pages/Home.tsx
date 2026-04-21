import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { Select } from "@coinbase/cds-web/alpha/select"
import { Checkbox, TextInput } from "@coinbase/cds-web/controls"
import { Icon } from "@coinbase/cds-web/icons"
import { ApiDocsPanel } from "@/components/ApiDocsPanel"
import { BuyFlowPanel } from "@/components/BuyFlowPanel"
import {
  createResource,
  sendCreatorReceiptEmail,
  type ApiResource,
} from "@/lib/api"
import { publicUrl } from "@/lib/publicUrl"
import { qrCenterImageSettings } from "@/lib/qrCenterImageSettings"
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
  TextTitle3,
  TextTitle4,
} from "@coinbase/cds-web/typography"
import i18n from "@/i18n/config"

const HERO_AMOUNT_FONT_FAMILY =
  'CoinbaseSans, var(--defaultFont-sans, system-ui), system-ui, sans-serif'

/** Matches hero main title; reused for the “Why 402 exists” heading. */
const HOME_HERO_HEADLINE_TEXT_STYLE: CSSProperties = {
  fontSize: "clamp(48px, 8vw, 85px)",
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  margin: 0,
}

/** Icons for `home.why402Examples` lines (retail → … → machine). */
const HOME_WHY402_EXAMPLE_ICONS = [
  "shoppingCart",
  "dinnerPlate",
  "chainLink",
  "qrCode",
  "clock",
  "api",
  "robot",
] as const satisfies readonly IconName[]

const PROTECTED_TTL_PRESETS = [900, 3600, 86400, 604800] as const

function sanitizeHomeAmountInput(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "")
  const firstDot = v.indexOf(".")
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "")
  }
  if (v.startsWith(".")) v = `0${v}`
  if (v === "") return "0"

  const dot = v.indexOf(".")
  const intRaw = dot === -1 ? v : v.slice(0, dot)
  const fracRaw = dot === -1 ? undefined : v.slice(dot + 1)
  let intPart = intRaw.replace(/^0+/, "")
  if (intPart === "") intPart = "0"
  if (fracRaw === undefined) return intPart

  const frac = fracRaw.replace(/\D/g, "").slice(0, 6)
  if (frac.length === 0) return `${intPart}.`
  return `${intPart}.${frac}`
}

/** After blur: whole USDC amounts show without a decimal; fractional amounts keep needed digits (trim trailing zeros). */
function formatHomeAmountNormalized(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const s = n.toFixed(6).replace(/\.?0+$/, "")
  if (s === "" || s === "-0") return "0"
  return s
}

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

/** Golden ratio φ; left column : right column = φ : 1 (messaging side is wider). */
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2

/** Text-only `MessagingCard`s: single column, media slot hidden. */
const HOME_CAPABILITIES_CARD_STYLES = {
  layoutContainer: {
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    width: "100%",
  },
  mediaContainer: {
    display: "none",
    width: 0,
    minWidth: 0,
    height: 0,
    overflow: "hidden",
  },
  contentContainer: {
    minWidth: 0,
    maxWidth: "100%",
    justifyContent: "flex-start",
    padding: 24,
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
  iconName: IconName
}

type HomeCapabilitiesCardRow = {
  id: string
  titleKey: string
  descriptionKey: string
  iconName: IconName
}

const HOME_CREATORS_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-creators-1",
    titleKey: "home.creatorsCard1Title",
    descriptionKey: "home.creatorsCard1Description",
    iconName: "chainLink",
  },
  {
    id: "home-creators-2",
    titleKey: "home.creatorsCard2Title",
    descriptionKey: "home.creatorsCard2Description",
    iconName: "download",
  },
  {
    id: "home-creators-3",
    titleKey: "home.creatorsCard3Title",
    descriptionKey: "home.creatorsCard3Description",
    iconName: "educationBook",
  },
  {
    id: "home-creators-4",
    titleKey: "home.creatorsCard4Title",
    descriptionKey: "home.creatorsCard4Description",
    iconName: "lock",
  },
  {
    id: "home-creators-5",
    titleKey: "home.creatorsCard5Title",
    descriptionKey: "home.creatorsCard5Description",
    iconName: "drops",
  },
]

const HOME_SOFTWARE_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-software-1",
    titleKey: "home.softwareCard1Title",
    descriptionKey: "home.softwareCard1Description",
    iconName: "api",
  },
  {
    id: "home-software-2",
    titleKey: "home.softwareCard2Title",
    descriptionKey: "home.softwareCard2Description",
    iconName: "lightningBolt",
  },
  {
    id: "home-software-3",
    titleKey: "home.softwareCard3Title",
    descriptionKey: "home.softwareCard3Description",
    iconName: "robot",
  },
]

const HOME_CAPABILITIES_CARDS: ReadonlyArray<HomeCapabilitiesCardRow> = [
  {
    id: "home-capabilities-1",
    titleKey: "home.capabilitiesCard1Title",
    descriptionKey: "home.capabilitiesCard1Description",
    iconName: "qrCode",
  },
  {
    id: "home-capabilities-2",
    titleKey: "home.capabilitiesCard2Title",
    descriptionKey: "home.capabilitiesCard2Description",
    iconName: "peopleGroup",
  },
]

/** Fixed height for full-width audience carousel hero banners (Creators + Software). */
const HOME_AUDIENCE_BANNER_HEIGHT_PX = 300

/** Creators carousel banner; asset: `public/img/home-audience-creators-banner-5.png`. */
const HOME_AUDIENCE_CREATORS_BANNER_SRC = publicUrl(
  "img/home-audience-creators-banner-5.png",
)
/** Scale image to cover the fixed-height banner (no letterboxing). */
const HOME_AUDIENCE_CREATORS_BANNER_BG_STYLE: CSSProperties = {
  backgroundImage: `url(${HOME_AUDIENCE_CREATORS_BANNER_SRC})`,
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
  backgroundPosition: "center",
}

/** Software carousel banner; asset: `public/img/home-audience-creators-banner-6.png`. */
const HOME_AUDIENCE_SOFTWARE_BANNER_SRC = publicUrl(
  "img/home-audience-creators-banner-6.png",
)
const HOME_AUDIENCE_SOFTWARE_BANNER_BG_STYLE: CSSProperties = {
  backgroundImage: `url(${HOME_AUDIENCE_SOFTWARE_BANNER_SRC})`,
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
  backgroundPosition: "center",
}

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
  const titleColor = isCreators ? "fg" : "fgInverse"
  const descriptionColor = isCreators ? "fgMuted" : "fgInverse"
  return (
    <MessagingCard
      as="article"
      type="upsell"
      width={385}
      mediaPlacement="end"
      title={
        <VStack gap={1.5} alignItems="flex-start" width="100%">
          <Box aria-hidden display="flex">
            <Icon name={card.iconName} size="m" color={titleColor} />
          </Box>
          <Text color={titleColor} font="title3" as="span">
            {titleText}
          </Text>
        </VStack>
      }
      description={
        <Text color={descriptionColor} font="label2" overflow="wrap">
          {t(card.descriptionKey)}
        </Text>
      }
      styles={{
        root: {
          backgroundColor: cardBackground,
        },
        ...HOME_CAPABILITIES_CARD_STYLES,
        textContainer: { gap: 24 },
      }}
    />
  )
}

function renderHomeCapabilitiesCard(
  card: HomeCapabilitiesCardRow,
  t: (key: string) => string,
) {
  const titleText = t(card.titleKey)
  return (
    <MessagingCard
      as="article"
      type="upsell"
      width="100%"
      maxWidth="100%"
      mediaPlacement="end"
      title={
        <VStack gap={3} alignItems="flex-start" width="100%">
          <Box aria-hidden display="flex">
            <Icon name={card.iconName} size="m" color="fg" />
          </Box>
          <Text color="fg" font="title3" as="span">
            {titleText}
          </Text>
        </VStack>
      }
      description={
        <Text color="fgMuted" font="label2" overflow="wrap">
          {t(card.descriptionKey)}
        </Text>
      }
      styles={{
        root: {
          backgroundColor: HOME_AUDIENCE_CREATORS_CARD_BG,
        },
        ...HOME_CAPABILITIES_CARD_STYLES,
        textContainer: { gap: 24 },
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
  const [amount, setAmount] = useState("0")
  const [label, setLabel] = useState("")
  /** Creator payout wallet (USDC on Base); normalized to lowercase on submit. */
  const [receiverAddress, setReceiverAddress] = useState("")
  /** Inline validation for the wallet field (create flow). */
  const [receiverAddressError, setReceiverAddressError] = useState<
    string | null
  >(null)
  /** Set only after API confirms a resource exists (create). */
  const [paymentUrl, setPaymentUrl] = useState("")
  /** Canonical unlock page + summary fields — kept when receipt send fails. */
  const [createdResource, setCreatedResource] = useState<ApiResource | null>(
    null,
  )
  const [receiptEmail, setReceiptEmail] = useState("")
  const [receiptPhase, setReceiptPhase] = useState<
    "idle" | "sending" | "success" | "failure"
  >("idle")
  const [receiptSentTo, setReceiptSentTo] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [protectedLinkUrl, setProtectedLinkUrl] = useState("")
  const [protectedTtlSeconds, setProtectedTtlSeconds] = useState(900)
  const [protectedOneTime, setProtectedOneTime] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

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

  const clearPaymentSuccessState = useCallback(() => {
    setPaymentUrl("")
    setCreatedResource(null)
    setReceiptEmail("")
    setReceiptPhase("idle")
    setReceiptSentTo(null)
  }, [])

  const invalidateQrIfFormChanged = useCallback(() => {
    clearPaymentSuccessState()
    setCreateError(null)
  }, [clearPaymentSuccessState])

  type HomeDeliveryTabId = "direct" | "protected"
  type HomeDeliveryTab = { id: HomeDeliveryTabId; label: string }

  const deliveryTabs = useMemo<HomeDeliveryTab[]>(
    () => [
      { id: "direct", label: t("home.deliveryDirect") },
      { id: "protected", label: t("home.deliveryProtected") },
    ],
    [t],
  )

  const [activeDeliveryTab, setActiveDeliveryTab] = useState<HomeDeliveryTab>(
    () => ({ id: "direct", label: "" }),
  )

  useEffect(() => {
    setActiveDeliveryTab((cur) => {
      const next = deliveryTabs.find((tab) => tab.id === cur.id)
      return next ?? deliveryTabs[0]!
    })
  }, [deliveryTabs])

  const handleDeliveryTabsChange = useCallback(
    (next: TabValue<HomeDeliveryTabId> | null) => {
      if (!next) return
      const resolved = deliveryTabs.find((tab) => tab.id === next.id)
      if (resolved) {
        setActiveDeliveryTab(resolved)
        invalidateQrIfFormChanged()
      }
    },
    [deliveryTabs, invalidateQrIfFormChanged],
  )

  const homeAmountDisplay = amount.trim() || "0"

  const homeAmountDigitCount = useMemo(() => {
    const m = homeAmountDisplay.match(/\d/g)
    return Math.min(14, Math.max(1, m?.length ?? 1))
  }, [homeAmountDisplay])

  const homeRailHeroAmountFontPx = useMemo(
    () =>
      Math.max(
        28,
        Math.min(80, Math.round(82 / (1 + (homeAmountDigitCount - 1) * 0.11))),
      ),
    [homeAmountDigitCount],
  )

  const homeRailHeroUsdFontPx = useMemo(() => {
    const ratio =
      homeAmountDigitCount <= 2 ? 1 : homeAmountDigitCount <= 5 ? 0.93 : 0.82
    return Math.round(homeRailHeroAmountFontPx * ratio)
  }, [homeAmountDigitCount, homeRailHeroAmountFontPx])

  const homeAmountMeasureRef = useRef<HTMLSpanElement>(null)
  const [homeAmountInputWidthPx, setHomeAmountInputWidthPx] = useState(48)

  useLayoutEffect(() => {
    const el = homeAmountMeasureRef.current
    if (!el) return
    setHomeAmountInputWidthPx(Math.ceil(el.getBoundingClientRect().width) + 10)
  }, [homeAmountDisplay, homeRailHeroAmountFontPx])

  const handleCreatePaymentLink = async () => {
    setCreateError(null)
    setReceiverAddressError(null)

    const recvResult = validateCreatorReceiverAddress(receiverAddress)
    if (recvResult.ok === false) {
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
      const basePayload = {
        label: labelT,
        amount: amountT,
        receiverAddress: recvResult.normalized,
      }
      let createPayload: Parameters<typeof createResource>[0] = basePayload
      const urlT = protectedLinkUrl.trim()
      if (activeDeliveryTab.id === "protected") {
        try {
          const u = new URL(urlT)
          if (u.protocol !== "https:" && u.protocol !== "http:") {
            throw new Error("bad scheme")
          }
        } catch {
          setCreateError(t("home.errorProtectedUrl"))
          clearPaymentSuccessState()
          setIsCreating(false)
          return
        }
        const ttl = protectedTtlSeconds
        if (!Number.isFinite(ttl) || ttl < 60 || ttl > 604800) {
          setCreateError(t("home.errorProtectedTtl"))
          clearPaymentSuccessState()
          setIsCreating(false)
          return
        }
        createPayload = {
          ...basePayload,
          unlockType: "link",
          unlockValue: urlT,
          deliveryMode: "protected",
          protectedTtlSeconds: ttl,
          oneTimeUnlock: protectedOneTime,
        }
      } else if (urlT) {
        try {
          const u = new URL(urlT)
          if (u.protocol !== "https:" && u.protocol !== "http:") {
            throw new Error("bad scheme")
          }
        } catch {
          setCreateError(t("home.errorPostPaymentUrl"))
          clearPaymentSuccessState()
          setIsCreating(false)
          return
        }
        createPayload = {
          ...basePayload,
          unlockType: "link",
          unlockValue: urlT,
          deliveryMode: "direct",
        }
      }
      const { response, data } = await createResource(createPayload)

      if (!response.ok || !data?.ok || !data.resource || !data.paymentUrl) {
        const msg =
          data?.error?.trim() ||
          t("home.createErrorHttp", { status: response.status })
        setCreateError(msg)
        clearPaymentSuccessState()
        return
      }

      setReceiverAddress(
        pickResourceReceiver(data.resource).toLowerCase() ||
          recvResult.normalized,
      )
      setCreatedResource(data.resource)
      setPaymentUrl(data.paymentUrl.trim())
      setReceiptEmail("")
      setReceiptPhase("idle")
      setReceiptSentTo(null)
      setCreateError(null)
      setReceiverAddressError(null)
    } catch {
      setCreateError(t("home.createErrorNetwork"))
      clearPaymentSuccessState()
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
    const slugPart =
      createdResource?.slug?.trim() || i18n.t("home.qrFilenamePayment")
    a.download = `402-${slugPart}.png`
    a.click()
  }, [createdResource?.slug])

  const handleSendReceipt = useCallback(async () => {
    if (!createdResource?.slug || receiptPhase === "sending") return
    const trimmed = receiptEmail.trim()
    if (trimmed.length < 5 || !trimmed.includes("@")) return

    setReceiptPhase("sending")
    try {
      const { response, data } = await sendCreatorReceiptEmail({
        slug: createdResource.slug,
        email: trimmed,
      })
      if (response.ok && data?.ok) {
        setReceiptPhase("success")
        setReceiptSentTo(trimmed)
        return
      }
      setReceiptPhase("failure")
      setReceiptSentTo(null)
    } catch {
      setReceiptPhase("failure")
      setReceiptSentTo(null)
    }
  }, [createdResource?.slug, receiptEmail, receiptPhase])

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
    ? { paddingStart: ruleGap, paddingEnd: { base: 3, desktop: 3 } as const }
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
            ...HOME_HERO_HEADLINE_TEXT_STYLE,
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
      paddingEnd={6}
      paddingBottom={{ base: 2, desktop: 3 }}
    >
      <Box
        borderRadius={400}
        background="bgSecondary"
        padding={{ base: 4, desktop: 5 }}
        width="100%"
        maxWidth={680}
        className="home-demo-proof-band"
      >
        <Box className="home-demo-proof-band__row">
          <Box minWidth={0} flexShrink={1} width="100%">
            <VStack gap={2} alignItems="stretch" width="100%">
              <TextBody
                color="fgMuted"
                as="p"
                style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
              >
                {t("home.demoBandBody")}
              </TextBody>
            </VStack>
          </Box>
          <Box flexShrink={0} display="flex" alignItems="center" style={{ height: "100%" }}>
            <IconButton
              as={Link}
              to="/demo"
              variant="primary"
              type="button"
              name="forwardArrow"
              compact={false}
              accessibilityLabel={t("home.demoBandCta")}
              style={{
                textDecoration: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )

  /** Carousel chrome for audience rows; cards use `MessagingCard` + heading `Icon`s. */
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
      <VStack alignItems="stretch" width="100%" style={{ gap: 38 }}>
        <Box
          width="100%"
          minWidth={0}
          borderRadius={400}
          overflow="hidden"
          role="img"
          aria-label={t("home.audienceCreatorsBannerAlt")}
          style={{
            height: HOME_AUDIENCE_BANNER_HEIGHT_PX,
            ...HOME_AUDIENCE_CREATORS_BANNER_BG_STYLE,
          }}
        />
        <VStack alignItems="stretch" width="100%" style={{ gap: 0 }}>
          <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
            <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
              {t("home.audienceCreatorsTitle")}
            </TextTitle3>
            <TextBody
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
            >
              {t("home.audienceCreatorsBody")}
            </TextBody>
          </VStack>
          <Carousel
            width="100%"
            minWidth={0}
            snapMode="item"
            paginationVariant="dot"
            styles={homeAudienceCarouselStyles}
          >
            {HOME_CREATORS_CARDS.map((card) => (
              <CarouselItem key={card.id} id={card.id}>
                {renderHomeAudienceMessagingCard(card, t, "creators")}
              </CarouselItem>
            ))}
          </Carousel>
        </VStack>
      </VStack>
    </Box>
  )

  const homeAudienceSoftwareCarousel = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 38 }}>
        <Box
          width="100%"
          minWidth={0}
          borderRadius={400}
          overflow="hidden"
          role="img"
          aria-label={t("home.audienceSoftwareBannerAlt")}
          style={{
            height: HOME_AUDIENCE_BANNER_HEIGHT_PX,
            ...HOME_AUDIENCE_SOFTWARE_BANNER_BG_STYLE,
          }}
        />
        <VStack alignItems="stretch" width="100%" style={{ gap: 0 }}>
          <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
            <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
              {t("home.audienceSoftwareTitle")}
            </TextTitle3>
            <TextBody
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
            >
              {t("home.audienceSoftwareBody")}
            </TextBody>
          </VStack>
          <Carousel
            width="100%"
            minWidth={0}
            snapMode="item"
            paginationVariant="dot"
            styles={homeAudienceCarouselStyles}
          >
            {HOME_SOFTWARE_CARDS.map((card) => (
              <CarouselItem key={card.id} id={card.id}>
                {renderHomeAudienceMessagingCard(card, t, "software")}
              </CarouselItem>
            ))}
          </Carousel>
        </VStack>
      </VStack>
    </Box>
  )

  const homeAudienceCapabilitiesSection = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
    >
      <VStack gap={3} alignItems="stretch" width="100%">
        <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
          <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
            {t("home.audienceCapabilitiesTitle")}
          </TextTitle3>
          <TextBody
            color="fgMuted"
            as="p"
            style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
          >
            {t("home.audienceCapabilitiesBody")}
          </TextBody>
        </VStack>
        <HStack
          gap={3}
          alignItems="stretch"
          width="100%"
          minWidth={0}
          flexDirection={isWide ? "row" : "column"}
        >
          {HOME_CAPABILITIES_CARDS.map((card) => (
            <Box
              key={card.id}
              flexGrow={isWide ? 1 : undefined}
              flexShrink={isWide ? 1 : undefined}
              flexBasis={isWide ? "0%" : undefined}
              width="100%"
              minWidth={0}
            >
              {renderHomeCapabilitiesCard(card, t)}
            </Box>
          ))}
        </HStack>
      </VStack>
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

  const homeUsdApproxDisplay = useMemo(() => {
    const n = parseFloat(amount.trim())
    const v = Number.isFinite(n) ? n : 0
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" })
  }, [amount])

  const protectedTtlSelectOptions = useMemo(
    () =>
      PROTECTED_TTL_PRESETS.map((sec) => ({
        value: String(sec),
        label:
          sec === 900
            ? t("home.ttlPreset15m")
            : sec === 3600
              ? t("home.ttlPreset1h")
              : sec === 86400
                ? t("home.ttlPreset24h")
                : t("home.ttlPreset7d"),
      })),
    [t],
  )

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
      <VStack gap={0} alignItems="stretch" width="100%" minWidth={0}>
        <HStack
          gap={0}
          alignItems="baseline"
          width="100%"
          minWidth={0}
          paddingTop={2}
        >
          <Box
            position="relative"
            display="inline-flex"
            alignItems="baseline"
            minWidth={0}
            maxWidth="calc(100% - 4.75rem)"
            flexShrink={1}
          >
            <Box
              as="span"
              ref={homeAmountMeasureRef}
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                visibility: "hidden",
                whiteSpace: "pre",
                pointerEvents: "none",
                fontFamily: HERO_AMOUNT_FONT_FAMILY,
                fontSize: homeRailHeroAmountFontPx,
                fontWeight: 400,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {homeAmountDisplay}
            </Box>
            <Box
              as="input"
              id="home-rail-amount"
              value={amount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setAmount(sanitizeHomeAmountInput(e.target.value))
                invalidateQrIfFormChanged()
              }}
              onBlur={() => {
                const raw = amount.trim()
                if (raw === "" || raw === ".") {
                  setAmount("0")
                  invalidateQrIfFormChanged()
                  return
                }
                const n = parseFloat(raw)
                if (!Number.isFinite(n)) {
                  setAmount("0")
                  invalidateQrIfFormChanged()
                  return
                }
                setAmount(formatHomeAmountNormalized(n))
                invalidateQrIfFormChanged()
              }}
              inputMode="decimal"
              autoComplete="off"
              style={{
                display: "block",
                width: homeAmountInputWidthPx,
                maxWidth: "100%",
                margin: 0,
                padding: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: HERO_AMOUNT_FONT_FAMILY,
                fontSize: homeRailHeroAmountFontPx,
                fontWeight: 400,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                textAlign: "left",
                color: "var(--color-fg)",
                caretColor: "var(--color-fgPrimary)",
              }}
            />
          </Box>
          <Box
            as="span"
            aria-hidden
            color="fgMuted"
            display="inline-block"
            style={{
              flexShrink: 0,
              margin: 0,
              padding: 0,
              paddingLeft: "0.04em",
              fontFamily: HERO_AMOUNT_FONT_FAMILY,
              fontSize: homeRailHeroUsdFontPx,
              fontWeight: 400,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            USDC
          </Box>
        </HStack>
        <TextBody
          color="fgPrimary"
          as="p"
          style={{ margin: 0, fontSize: 15, lineHeight: 1.25 }}
        >
          {t("home.usdApprox", { amount: homeUsdApproxDisplay })}
        </TextBody>
      </VStack>
    </Box>
  )

  const homeRailPrimaryFields = (
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
        placeholder={t("home.labelPlaceholder")}
      />
      <VStack gap={1} alignItems="stretch">
        <TextInput
          compact
          {...homeFormTextInputSurface}
          label={t("home.payoutWallet")}
          value={receiverAddress}
          onChange={(e) => {
            setReceiverAddress(e.target.value)
            setReceiverAddressError(null)
            invalidateQrIfFormChanged()
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="0x"
        />
        {receiverAddressError ? (
          <TextCaption color="fgNegative" as="p" style={{ margin: 0 }}>
            {receiverAddressError}
          </TextCaption>
        ) : null}
      </VStack>
      <TextInput
        compact
        {...homeFormTextInputSurface}
        label={t("home.postPaymentOpens")}
        helperText={t("home.postPaymentOpensHelper")}
        value={protectedLinkUrl}
        onChange={(e) => {
          setProtectedLinkUrl(e.target.value)
          invalidateQrIfFormChanged()
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("home.postPaymentOpensPlaceholder")}
      />
    </VStack>
  )

  const homeRailDeliveryBlock = (
    <VStack gap={2} alignItems="stretch" width="100%">
      <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
        {t("home.deliveryMode")}
      </TextLabel1>
      <SegmentedTabs<HomeDeliveryTabId>
        accessibilityLabel={t("home.deliveryMode")}
        activeTab={activeDeliveryTab}
        onChange={handleDeliveryTabsChange}
        tabs={deliveryTabs}
        alignSelf="flex-start"
        maxWidth="100%"
      />
      {activeDeliveryTab.id === "protected" ? (
        <VStack gap={1} alignItems="stretch" width="100%">
          <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
            {t("home.deliveryProtectedBlurb1")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
            {t("home.deliveryProtectedBlurb2")}
          </TextBody>
        </VStack>
      ) : activeDeliveryTab.id === "direct" ? (
        <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
          {t("home.deliveryDirectBlurb")}
        </TextBody>
      ) : null}
    </VStack>
  )

  const homeRailProtectedSettings = (
    <VStack gap={4} alignItems="stretch" width="100%">
      <HStack
        gap={3}
        alignItems="center"
        justifyContent="space-between"
        width="100%"
        minWidth={0}
      >
        <HStack gap={1} alignItems="center" minWidth={0} flexShrink={1}>
          <Box flexShrink={0} display="flex" alignItems="center">
            <Icon name="clock" size="m" color="fgPrimary" />
          </Box>
          <TextLabel1
            color="fg"
            as="span"
            style={{ margin: 0, fontWeight: 600, lineHeight: 1.35 }}
          >
            {t("home.unlockLinkExpiresTitle")}
          </TextLabel1>
        </HStack>
        <Box flexShrink={0} minWidth={0} maxWidth="50%">
          <Select
            type="single"
            value={String(protectedTtlSeconds)}
            onChange={(next) => {
              if (next == null) return
              setProtectedTtlSeconds(Number(next))
              invalidateQrIfFormChanged()
            }}
            options={protectedTtlSelectOptions}
            compact
            bordered={false}
            variant="foregroundMuted"
            align="end"
            accessibilityLabel={t("home.unlockLinkExpiresTitle")}
            controlAccessibilityLabel={t("home.unlockLinkExpiresTitle")}
            classNames={{
              controlValueNode: "home-protected-ttl-select-value",
            }}
            styles={{ dropdown: { width: 172 } }}
          />
        </Box>
      </HStack>
      <Checkbox
        id="home-protected-one-time"
        value="one-time-unlock"
        checked={protectedOneTime}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setProtectedOneTime(e.target.checked)
          invalidateQrIfFormChanged()
        }}
        accessibilityLabel={t("home.protectedOneTime")}
      >
        <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
          {t("home.protectedOneTime")}
        </TextLabel1>
      </Checkbox>
    </VStack>
  )

  const homeSellRule = (
    <Box width="100%" paddingY={4}>
      <Divider />
    </Box>
  )

  const homeSellRailWorkflow = (
    <VStack gap={0} alignItems="stretch" width="100%">
      {homeRailAmountHero}
      {homeSellRule}
      {homeRailPrimaryFields}
      {homeSellRule}
      {homeRailDeliveryBlock}
      {activeDeliveryTab.id === "protected" ? (
        <>
          {homeSellRule}
          {homeRailProtectedSettings}
        </>
      ) : null}
    </VStack>
  )

  const homeFormSubmit = (
    <VStack gap={2} alignItems="stretch" width="100%">
      <Button
        block
        variant="primary"
        type="button"
        onClick={handleCreatePaymentLink}
        disabled={isCreating || !canCreateOnRail}
        style={{ borderRadius: "100px" }}
        title={
          canCreateOnRail ? undefined : t("home.railCreateDisabledHint")
        }
      >
        {isCreating
          ? t("home.createLinkQrLoading")
          : activeDeliveryTab.id === "protected"
            ? t("home.createProtectedLink")
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

  const homeRailResultSection =
    hasQr && createdResource ? (
      <VStack gap={4} alignItems="stretch" width="100%">
        <Box
          borderRadius={400}
          background="bgSecondary"
          padding={{ base: 4, desktop: 5 }}
          width="100%"
          minWidth={0}
        >
          <VStack gap={4} alignItems="stretch" width="100%">
            <VStack gap={1} alignItems="stretch" width="100%">
              <TextTitle3 color="fg" as="p" style={{ margin: 0 }}>
                {t("home.successHeadline")}
              </TextTitle3>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("home.successSupporting")}
              </TextBody>
            </VStack>

            <Box display="flex" justifyContent="center" width="100%">
              <QRCodeCanvas
                ref={qrCanvasRef}
                value={paymentUrl}
                size={isWide ? 220 : 200}
                marginSize={2}
                level="H"
                bgColor="#ffffff"
                fgColor="#000000"
                imageSettings={qrCenterImageSettings(isWide ? 220 : 200)}
                style={{ borderRadius: 16 }}
              />
            </Box>

            <Box
              borderRadius={400}
              background="bg"
              padding={3}
              width="100%"
              minWidth={0}
            >
              <VStack gap={2} alignItems="stretch" width="100%">
                <HStack
                  gap={3}
                  alignItems="flex-start"
                  justifyContent="space-between"
                  width="100%"
                  minWidth={0}
                >
                  <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                    {t("home.summaryItem")}
                  </TextCaption>
                  <TextBody
                    as="p"
                    color="fg"
                    style={{
                      margin: 0,
                      textAlign: "end",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {createdResource.label}
                  </TextBody>
                </HStack>
                <HStack
                  gap={3}
                  alignItems="flex-start"
                  justifyContent="space-between"
                  width="100%"
                  minWidth={0}
                >
                  <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                    {t("home.summaryPrice")}
                  </TextCaption>
                  <TextBody
                    as="p"
                    color="fg"
                    style={{ margin: 0, textAlign: "end", lineHeight: 1.45 }}
                  >
                    {`${createdResource.amount} ${createdResource.currency}`}
                  </TextBody>
                </HStack>
                <HStack
                  gap={3}
                  alignItems="flex-start"
                  justifyContent="space-between"
                  width="100%"
                  minWidth={0}
                >
                  <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                    {t("home.summaryNetwork")}
                  </TextCaption>
                  <TextBody
                    as="p"
                    color="fg"
                    style={{ margin: 0, textAlign: "end", lineHeight: 1.45 }}
                  >
                    {createdResource.network.trim().toLowerCase() === "base"
                      ? "Base"
                      : createdResource.network.trim()}
                  </TextBody>
                </HStack>
                <HStack
                  gap={3}
                  alignItems="flex-start"
                  justifyContent="space-between"
                  width="100%"
                  minWidth={0}
                >
                  <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                    {t("home.summaryDelivery")}
                  </TextCaption>
                  <TextBody
                    as="p"
                    color="fg"
                    style={{
                      margin: 0,
                      textAlign: "end",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {createdResource.deliveryMode === "protected"
                      ? t("home.deliveryProtected")
                      : t("home.deliveryDirect")}
                  </TextBody>
                </HStack>
              </VStack>
            </Box>

            <Box
              borderRadius={400}
              background="bg"
              padding={3}
              width="100%"
              minWidth={0}
            >
              <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
                <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("home.paymentLinkLabel")}
                </TextCaption>
                <Box
                  minWidth={0}
                  style={{
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  <TextBody
                    mono
                    as="p"
                    color="fg"
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: 1.45,
                    }}
                  >
                    {paymentUrl}
                  </TextBody>
                </Box>
              </VStack>
            </Box>

            <VStack gap={2} alignItems="stretch" width="100%">
              <Button
                block
                variant="primary"
                type="button"
                onClick={copyPaymentUrl}
                style={{ borderRadius: "100px" }}
              >
                {t("home.primaryCopyPaymentLink")}
              </Button>
              <Button
                block
                variant="secondary"
                type="button"
                onClick={downloadQr}
                style={{ borderRadius: "100px" }}
              >
                {t("home.downloadQrCode")}
              </Button>
              <HomeLinkActionRow
                iconName="share"
                label={t("home.share")}
                onClick={sharePayment}
              />
            </VStack>
          </VStack>
        </Box>

        <Box
          bordered
          borderRadius={400}
          background="bgSecondary"
          padding={{ base: 4, desktop: 4 }}
          width="100%"
          minWidth={0}
        >
          <VStack gap={3} alignItems="stretch" width="100%">
            <TextLabel1 color="fg" as="p" style={{ margin: 0, fontWeight: 650 }}>
              {t("home.keepCopyTitle")}
            </TextLabel1>
            <TextCaption color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
              {t("home.keepCopyHelper")}
            </TextCaption>
            {isWide ? (
              <HStack
                gap={2}
                alignItems="flex-end"
                width="100%"
                minWidth={0}
              >
                <Box flexGrow={1} minWidth={0}>
                  <TextInput
                    compact
                    {...homeFormTextInputSurface}
                    label={t("home.receiptEmailLabel")}
                    value={receiptEmail}
                    onChange={(e) => {
                      setReceiptEmail(e.target.value)
                      if (
                        receiptPhase === "success" ||
                        receiptPhase === "failure"
                      ) {
                        setReceiptPhase("idle")
                        setReceiptSentTo(null)
                      }
                    }}
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="you@email.com"
                  />
                </Box>
                <Button
                  variant="primary"
                  type="button"
                  compact
                  onClick={handleSendReceipt}
                  disabled={
                    receiptPhase === "sending" ||
                    receiptEmail.trim().length < 5 ||
                    !receiptEmail.trim().includes("@")
                  }
                  style={{ borderRadius: "100px", flexShrink: 0 }}
                >
                  {receiptPhase === "sending"
                    ? t("home.receiptSending")
                    : t("home.sendReceipt")}
                </Button>
              </HStack>
            ) : (
              <VStack gap={2} alignItems="stretch" width="100%">
                <TextInput
                  compact
                  {...homeFormTextInputSurface}
                  label={t("home.receiptEmailLabel")}
                  value={receiptEmail}
                  onChange={(e) => {
                    setReceiptEmail(e.target.value)
                    if (
                      receiptPhase === "success" ||
                      receiptPhase === "failure"
                    ) {
                      setReceiptPhase("idle")
                      setReceiptSentTo(null)
                    }
                  }}
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="you@email.com"
                />
                <Button
                  block
                  variant="primary"
                  type="button"
                  onClick={handleSendReceipt}
                  disabled={
                    receiptPhase === "sending" ||
                    receiptEmail.trim().length < 5 ||
                    !receiptEmail.trim().includes("@")
                  }
                  style={{ borderRadius: "100px" }}
                >
                  {receiptPhase === "sending"
                    ? t("home.receiptSending")
                    : t("home.sendReceipt")}
                </Button>
              </VStack>
            )}
            {receiptPhase === "success" && receiptSentTo ? (
              <TextCaption color="fgPrimary" as="p" style={{ margin: 0 }}>
                {t("home.receiptSent", { email: receiptSentTo })}
              </TextCaption>
            ) : null}
            {receiptPhase === "failure" ? (
              <TextCaption color="fgNegative" as="p" style={{ margin: 0 }}>
                {t("home.receiptFailed")}
              </TextCaption>
            ) : null}
          </VStack>
        </Box>
      </VStack>
    ) : null

  const homeWhy402 = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingTop={6}
      paddingBottom={6}
    >
      <Box width="100%" maxWidth={680} minWidth={0}>
        <VStack gap={6} alignItems="stretch" width="100%">
          <VStack gap={3} alignItems="stretch" width="100%">
            <Box
              as="h1"
              color="fg"
              font="headline"
              style={HOME_HERO_HEADLINE_TEXT_STYLE}
            >
              {t("home.why402Heading")}
            </Box>
            <TextTitle4 color="fg" as="p" style={{ margin: 0, lineHeight: 1.45 }}>
              {t("home.why402Tagline")}
            </TextTitle4>
          </VStack>
          <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.6 }}>
            {t("home.why402Lead")}
          </TextBody>
          <VStack
            as="ul"
            gap={2}
            alignItems="stretch"
            width="100%"
            margin={0}
            padding={0}
            style={{ listStyle: "none" }}
          >
            {why402ExampleLines.map((line, i) => (
              <Box as="li" key={i} style={{ margin: 0 }}>
                <HStack
                  gap={3}
                  alignItems="center"
                  width="100%"
                  minWidth={0}
                >
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
                    <Icon
                      name={HOME_WHY402_EXAMPLE_ICONS[i] ?? "circleCheckmark"}
                      size="s"
                      color="fgInverse"
                    />
                  </Box>
                  <Box flexGrow={1} minWidth={0}>
                    <TextBody
                      color="fgMuted"
                      as="p"
                      style={{
                        margin: 0,
                        lineHeight: 1.55,
                        textAlign: "start",
                      }}
                    >
                      {line}
                    </TextBody>
                  </Box>
                </HStack>
              </Box>
            ))}
          </VStack>
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
      {homeAudienceCapabilitiesSection}
      <HomeHorizontalRule />
      {homeWhy402}
    </VStack>
  )

  /**
   * Transaction rail: Sell/Buy/API tabs → amount → fields → delivery → CTA;
   * generated QR/URL/share live in `homeRailResultSection` below the CTA.
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
      <Box width="100%" paddingBottom={6} {...rightColumnInnerPad}>
        <VStack gap={5} alignItems="stretch" width="100%">
          {homeRailSegmentedControl}
          {activeTab.id === "sell" ? (
            <>
              {homeSellRailWorkflow}
              {homeFormSubmit}
              {homeRailResultSection}
            </>
          ) : activeTab.id === "buy" ? (
            <BuyFlowPanel variant="rail" />
          ) : activeTab.id === "api" ? (
            <ApiDocsPanel variant="rail" />
          ) : null}
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
            {homeAudienceCapabilitiesSection}
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
