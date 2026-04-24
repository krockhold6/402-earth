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
import { Link as RouterLink } from "react-router-dom"
import { QRCodeCanvas } from "qrcode.react"
import { Button, IconButton } from "@coinbase/cds-web/buttons"
import { Select } from "@coinbase/cds-web/alpha/select"
import { cdsCompactSelectFieldStyles } from "@/cds/appCdsFieldDefaults"
import { Checkbox, NativeTextArea, TextInput } from "@coinbase/cds-web/controls"
import { Icon } from "@coinbase/cds-web/icons"
import { CapabilityManagePanel } from "@/components/CapabilityManagePanel"
import { ApiDocsPanel } from "@/components/ApiDocsPanel"
import { BuyFlowPanel } from "@/components/BuyFlowPanel"
import {
  createResource,
  sendCreatorReceiptEmail,
  type ApiResource,
} from "@/lib/api"
import {
  buildPhysicalUnlockJson,
  PHYSICAL_INSTRUCTIONS_MAX_LENGTH,
} from "@/lib/paidResourceUnlock"
import { mcpNameFromCapabilityName } from "@/lib/mcpNameFromCapabilityName"
import { homeCapabilityCreateSchema } from "@/lib/sellSchemas"
import { publicUrl } from "@/lib/publicUrl"
import { qrCenterImageSettings } from "@/lib/qrCenterImageSettings"
import { useMediaQuery } from "@coinbase/cds-web/hooks/useMediaQuery"
import { useTheme } from "@coinbase/cds-web/hooks/useTheme"
import { Interactable } from "@coinbase/cds-web/system/Interactable"
import { Carousel, CarouselItem } from "@coinbase/cds-web/carousel"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, Grid, GridColumn, HStack, VStack } from "@coinbase/cds-web/layout"
import { Tooltip } from "@coinbase/cds-web/overlays/Tooltip"
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
import { useCdsColorScheme } from "@/providers/cdsColorSchemeContext"

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

/**
 * Home narrative (Resources, Capabilities, how / examples / why) — display-scale line.
 * Fluid type: caps at the prior fixed size on large viewports, scales down on narrow
 * (same clamp pattern as `HOME_HERO_HEADLINE_TEXT_STYLE`).
 */
const HOME_SECTION_DISPLAY_HERO_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "clamp(2rem, 4.2vw + 1.25rem, 5.025rem)",
  fontWeight: 700,
  lineHeight: 1.02,
  letterSpacing: "-0.03em",
  fontFamily: HERO_AMOUNT_FONT_FAMILY,
}

/**
 * Vertical padding for home left-column **sections** (hero + demo band stay
 * tight; everything from Commerce through the bottom CTA uses this).
 */
const HOME_NARRATIVE_SECTION_PAD_Y = { base: 8, desktop: 10 } as const

/** Home commerce band wordmarks — light + dark (`public/img/home-commerce/`). */
const HOME_COMMERCE_IMAGES_BY_SCHEME = {
  light: {
    wordmark402: "/img/home-commerce/402-large.svg",
    base: "/img/home-commerce/base-logo.svg",
    usdc: "/img/home-commerce/usdc.svg",
    x402: "/img/home-commerce/x402.svg",
  },
  dark: {
    wordmark402: "/img/home-commerce/402-large-dark.svg",
    base: "/img/home-commerce/base-logo-dark.svg",
    usdc: "/img/home-commerce/usdc-dark.svg",
    x402: "/img/home-commerce/x402-dark.svg",
  },
} as const

/** Shared slot for Base / USDC / x402 logos in the commerce rail cards. */
const HOME_COMMERCE_RAIL_LOGO_STYLE: CSSProperties = {
  width: 120,
  height: 32,
  maxWidth: "100%",
  objectFit: "contain",
}

const HOME_COMMERCE_TITLE_TEXT_STYLE: CSSProperties = {
  fontSize: "clamp(40px, 8vw, 80px)",
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  margin: 0,
}

/** Icons for `home.why402Examples` lines (… → machine). */
const HOME_WHY402_EXAMPLE_ICONS = [
  "dinnerPlate",
  "chainLink",
  "qrCode",
  "clock",
  "api",
  "robot",
] as const satisfies readonly IconName[]

const PROTECTED_TTL_PRESETS = [0, 900, 3600, 86400, 604800] as const

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

function apiSellType(resource: ApiResource): "resource" | "capability" {
  if (resource.sellType === "capability" || resource.sell_type === "capability") {
    return "capability"
  }
  return "resource"
}

/** Golden ratio φ; left column : right column = φ : 1 (messaging side is wider). */
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2

/**
 * Distance from viewport top for `position: sticky` on the right transaction rail,
 * below the sticky `PageHeader` (~56px) plus a little air.
 */
const DESKTOP_QR_STICKY_TOP_PX = 64

/** Creators: spectrum Gray10 (matches “Background alternate” in light theme). */
const HOME_AUDIENCE_CREATORS_CARD_BG = "rgb(var(--gray10))"

type HomeAudienceMessagingCardRow = {
  id: string
  titleKey: string
  descriptionKey: string
  /** Full-bleed photo hero; omit when `heroVisual` is `"dotGrid"`. */
  imageSrc?: string
  iconName: IconName
  /** `"dotGrid"` = vector dot grid with centered icon (Capabilities cards). */
  heroVisual?: "image" | "dotGrid"
}

const HOME_CREATORS_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-creators-1",
    titleKey: "home.creatorsCard1Title",
    descriptionKey: "home.creatorsCard1Description",
    imageSrc: publicUrl("img/home-audience-creators-banner-3.jpg"),
    iconName: "chainLink",
  },
  {
    id: "home-creators-2",
    titleKey: "home.creatorsCard2Title",
    descriptionKey: "home.creatorsCard2Description",
    imageSrc: publicUrl("img/home-audience-creators-banner-4.jpg"),
    iconName: "download",
  },
  {
    id: "home-creators-3",
    titleKey: "home.creatorsCard3Title",
    descriptionKey: "home.creatorsCard3Description",
    imageSrc: publicUrl("img/home-audience-creators-banner-6.png"),
    iconName: "educationBook",
  },
  {
    id: "home-creators-4",
    titleKey: "home.creatorsCard4Title",
    descriptionKey: "home.creatorsCard4Description",
    imageSrc: publicUrl("img/home-audience-creators-banner-7.png"),
    iconName: "lock",
  },
  {
    id: "home-creators-5",
    titleKey: "home.creatorsCard5Title",
    descriptionKey: "home.creatorsCard5Description",
    imageSrc: publicUrl("img/home-audience-creators-banner-8.png"),
    iconName: "drops",
  },
]

const HOME_SOFTWARE_CARDS: ReadonlyArray<HomeAudienceMessagingCardRow> = [
  {
    id: "home-software-1",
    titleKey: "home.softwareCard1Title",
    descriptionKey: "home.softwareCard1Description",
    iconName: "developerAPIProduct",
    heroVisual: "dotGrid",
  },
  {
    id: "home-software-2",
    titleKey: "home.softwareCard2Title",
    descriptionKey: "home.softwareCard2Description",
    iconName: "lightningBolt",
    heroVisual: "dotGrid",
  },
  {
    id: "home-software-3",
    titleKey: "home.softwareCard3Title",
    descriptionKey: "home.softwareCard3Description",
    iconName: "auto",
    heroVisual: "dotGrid",
  },
  {
    id: "home-software-4",
    titleKey: "home.softwareCard4Title",
    descriptionKey: "home.softwareCard4Description",
    iconName: "compose",
    heroVisual: "dotGrid",
  },
]

function HomeAudienceCardDotGridHero({
  cardId,
  iconName,
}: {
  cardId: string
  iconName: IconName
}) {
  const theme = useTheme()
  /** Inverse of page chrome: dark hero on light app, light hero on dark app. */
  const surface = theme.color.bgInverse
  const dot = theme.color.bgLineInverse
  const patternId = `home-audience-dotgrid-${cardId}`
  return (
    <Box
      position="relative"
      width="100%"
      style={{
        height: 355,
        borderRadius: 8,
        overflow: "hidden",
        flex: "0 0 auto",
        backgroundColor: surface,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          pointerEvents: "none",
        }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id={patternId}
            width={12}
            height={12}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={6} cy={6} r={1} fill={dot} fillOpacity={0.22} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={surface} />
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <Box
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
        width="100%"
        style={{ height: 355, zIndex: 1 }}
        aria-hidden
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          style={{ transform: "scale(2.75)", transformOrigin: "center" }}
        >
          <Icon name={iconName} size="l" color="fgInverse" />
        </Box>
      </Box>
    </Box>
  )
}

function renderHomeAudienceMessagingCard(
  card: HomeAudienceMessagingCardRow,
  t: (key: string) => string,
) {
  const titleText = t(card.titleKey)
  const descriptionText = t(card.descriptionKey)
  const useDotGrid = card.heroVisual === "dotGrid"
  return (
    <Box
      as="article"
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      width={404}
      minWidth={0}
      maxWidth="100%"
      style={{
        flex: "0 0 auto",
        borderRadius: 16,
        gap: 10,
        padding: 0,
        background: "unset",
      }}
      color="fg"
      aria-label={`${titleText}. ${descriptionText}`}
    >
      {useDotGrid ? (
        <HomeAudienceCardDotGridHero cardId={card.id} iconName={card.iconName} />
      ) : (
        <Box
          width="100%"
          style={{
            height: 355,
            borderRadius: 8,
            overflow: "hidden",
            flex: "0 0 auto",
          }}
        >
          <Box
            as="img"
            src={card.imageSrc}
            alt=""
            aria-hidden
            width="100%"
            style={{
              height: 355,
              objectFit: "cover",
              objectPosition: "center",
              display: "block",
            }}
          />
        </Box>
      )}
      <HStack
        alignItems="center"
        width="100%"
        minWidth={0}
        style={{ flex: "0 0 auto", minHeight: 37, gap: 12 }}
        paddingX={0}
        paddingY={0}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          style={{ width: 23, height: 21 }}
          aria-hidden
        >
          <Icon name={card.iconName} size="m" color="fg" />
        </Box>
        <Text
          as="h3"
          color="fg"
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: "37px",
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            fontFamily:
              'var(--defaultFont-sans, "OpenAI Sans", system-ui), system-ui, sans-serif',
          }}
        >
          {titleText}
        </Text>
      </HStack>
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
  const commerceImages = HOME_COMMERCE_IMAGES_BY_SCHEME[colorScheme]
  const isWide = useMediaQuery("(min-width: 960px)")
  /** When true, sell-type control stacks under the rail row (narrow workflow column). */
  const workflowSellTypeBelowRail = useMediaQuery("(max-width: 639px)")
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
  /** Direct delivery only; reset to `link` when switching to Protected. */
  const [postPaymentUnlockKind, setPostPaymentUnlockKind] = useState<
    "link" | "physical"
  >("link")
  const [physicalInstructions, setPhysicalInstructions] = useState("")
  const [protectedTtlSeconds, setProtectedTtlSeconds] = useState(900)
  const [protectedOneTime, setProtectedOneTime] = useState(false)
  type HomeSellTypeTabId = "resource" | "capability"
  type HomeSellTypeTab = { id: HomeSellTypeTabId; label: string }
  const sellTypeTabs = useMemo<HomeSellTypeTab[]>(
    () => [
      { id: "resource", label: t("home.sellTypeResource") },
      { id: "capability", label: t("home.sellTypeCapability") },
    ],
    [t],
  )
  const [activeSellTypeTab, setActiveSellTypeTab] = useState<HomeSellTypeTab>(
    () => ({ id: "resource", label: "" }),
  )
  useEffect(() => {
    setActiveSellTypeTab((cur) => {
      const next = sellTypeTabs.find((tab) => tab.id === cur.id)
      return next ?? sellTypeTabs[0]!
    })
  }, [sellTypeTabs])

  type HomeCapDeliveryTabId = "direct" | "protected" | "async"
  type HomeCapDeliveryTab = { id: HomeCapDeliveryTabId; label: string }
  const capabilityDeliveryTabs = useMemo<HomeCapDeliveryTab[]>(
    () => [
      { id: "direct", label: t("home.deliveryDirect") },
      { id: "protected", label: t("home.deliveryProtected") },
      { id: "async", label: t("home.deliveryAsync") },
    ],
    [t],
  )
  const [activeCapDeliveryTab, setActiveCapDeliveryTab] =
    useState<HomeCapDeliveryTab>(() => ({ id: "direct", label: "" }))
  useEffect(() => {
    setActiveCapDeliveryTab((cur) => {
      const next = capabilityDeliveryTabs.find((tab) => tab.id === cur.id)
      return next ?? capabilityDeliveryTabs[0]!
    })
  }, [capabilityDeliveryTabs])

  const [capabilityName, setCapabilityName] = useState("")
  const [capEndpoint, setCapEndpoint] = useState("")
  const [capHttpMethod, setCapHttpMethod] = useState("POST")
  const [capInputFormat, setCapInputFormat] = useState("json")
  const [capResultFormat, setCapResultFormat] = useState("json")
  const [capabilityExposure, setCapabilityExposure] = useState<
    "api" | "mcp" | "both"
  >("api")
  const [capMcpName, setCapMcpName] = useState("")
  const [capMcpDescription, setCapMcpDescription] = useState("")
  const [capMcpType, setCapMcpType] = useState<"tool" | "resource" | "prompt">(
    "tool",
  )
  const [capReceiptMode, setCapReceiptMode] = useState<"standard" | "detailed">(
    "standard",
  )
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const homeWorkflowRailRef = useRef<HTMLDivElement>(null)

  const hasQr = paymentUrl !== ""

  const why402ExampleLines = useMemo(
    () =>
      t("home.why402Examples")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [t],
  )

  const why402PillarCards = useMemo(
    () => [
      { title: t("home.why402EverydayTitle"), body: t("home.why402EverydayBody") },
      { title: t("home.why402CreatorTitle"), body: t("home.why402CreatorBody") },
      { title: t("home.why402MachineTitle"), body: t("home.why402MachineBody") },
    ],
    [t],
  )

  const homeFlowSteps = useMemo(
    () => [
      { title: t("howItWorks.step1Title"), body: t("howItWorks.step1Body") },
      { title: t("howItWorks.step2Title"), body: t("howItWorks.step2Body") },
      { title: t("howItWorks.step3Title"), body: t("howItWorks.step3Body") },
      {
        title: t("home.capabilitiesCard1Title"),
        body: t("home.capabilitiesCard1Description"),
      },
      {
        title: t("home.capabilitiesCard2Title"),
        body: t("home.capabilitiesCard2Description"),
      },
    ],
    [t],
  )
  const { howItWorksCoreSteps, howItWorksBuilderSteps } = useMemo(
    () => ({
      howItWorksCoreSteps: homeFlowSteps.slice(0, 3),
      howItWorksBuilderSteps: homeFlowSteps.slice(3),
    }),
    [homeFlowSteps],
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

  /**
   * Coinbase-style "Order Types" pattern: tapping the sell-type pill in the
   * rail header slides the workflow form out and slides a full-rail chooser
   * panel in from the right. Picking an option (or pressing back) reverses
   * the animation and applies the new selection. See `sellTypeChooserPanel`
   * and the sliding container in `rightPane`.
   */
  const [sellTypeChooserOpen, setSellTypeChooserOpen] = useState(false)
  const sellTypeChooserPanelId = "home-rail-sell-type-chooser"
  const sellTypeChooserHeadingId = "home-rail-sell-type-chooser-title"
  const homeRailTheme = useTheme()

  const handleScrollToWorkflow = useCallback(() => {
    const sellTab = railTabs.find((tab) => tab.id === "sell")
    if (sellTab) updateActiveTab(sellTab)
    requestAnimationFrame(() => {
      homeWorkflowRailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
  }, [railTabs])

  const canCreateOnRail = activeTab.id === "sell"

  const clearPaymentSuccessState = useCallback(() => {
    setPaymentUrl("")
    setCreatedResource(null)
    setReceiptEmail("")
    setReceiptPhase("idle")
    setReceiptSentTo(null)
  }, [])

  const handleCapabilityResourceUpdated = useCallback((r: ApiResource) => {
    setCreatedResource(r)
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

  useEffect(() => {
    if (activeDeliveryTab.id === "protected") {
      setPostPaymentUnlockKind("link")
    }
  }, [activeDeliveryTab.id])

  const handleSellTypeChooserSelect = useCallback(
    (key: HomeSellTypeTabId) => {
      const resolved = sellTypeTabs.find((tab) => tab.id === key)
      if (resolved) {
        setActiveSellTypeTab(resolved)
        invalidateQrIfFormChanged()
      }
      setSellTypeChooserOpen(false)
    },
    [sellTypeTabs, invalidateQrIfFormChanged],
  )

  const activeSellTypeDropdownLabel = useMemo(() => {
    if (activeSellTypeTab.id === "resource") {
      return t("home.sellTypeDropdownResource", {
        defaultValue: t("home.sellTypeResource"),
      })
    }
    return t("home.sellTypeDropdownCapability", {
      defaultValue: t("home.sellTypeCapability"),
    })
  }, [activeSellTypeTab.id, t])

  /**
   * Two-row chooser shown when `sellTypeChooserOpen` is true. Each row mirrors
   * the Coinbase "Order Types" panel: circular icon, bold title, supporting
   * description, trailing chevron. Translations use the dropdown labels so
   * "Resource / Capability" stays the canonical user-facing wording.
   */
  const sellTypeChooserOptions = useMemo<
    ReadonlyArray<{
      id: HomeSellTypeTabId
      title: string
      description: string
      iconName: IconName
    }>
  >(
    () => [
      {
        id: "resource",
        title: t("home.sellTypeDropdownResource", {
          defaultValue: t("home.sellTypeResource"),
        }),
        description: t("home.sellTypeChooserResourceDescription"),
        iconName: "chainLink",
      },
      {
        id: "capability",
        title: t("home.sellTypeDropdownCapability", {
          defaultValue: t("home.sellTypeCapability"),
        }),
        description: t("home.sellTypeChooserCapabilityDescription"),
        iconName: "api",
      },
    ],
    [t],
  )

  const handleCapDeliveryTabsChange = useCallback(
    (next: TabValue<HomeCapDeliveryTabId> | null) => {
      if (!next) return
      const resolved = capabilityDeliveryTabs.find((tab) => tab.id === next.id)
      if (resolved) {
        setActiveCapDeliveryTab(resolved)
        invalidateQrIfFormChanged()
      }
    },
    [capabilityDeliveryTabs, invalidateQrIfFormChanged],
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

    const amountT = amount.trim()
    if (!amountT) {
      setCreateError(t("home.errorAmount"))
      return
    }

    if (activeSellTypeTab.id === "capability") {
      const parsed = homeCapabilityCreateSchema.safeParse({
        capabilityName: capabilityName.trim(),
        amount: amountT,
        receiverAddress: recvResult.normalized,
        endpoint: capEndpoint.trim(),
        httpMethod: capHttpMethod,
        inputFormat: capInputFormat.trim(),
        resultFormat: capResultFormat.trim(),
        capabilityExposure,
        mcpName: capMcpName.trim(),
        mcpDescription: capMcpDescription.trim(),
        mcpType: capMcpType,
        mcpRequiresPayment: true,
        deliveryMode: activeCapDeliveryTab.id,
        receiptMode: capReceiptMode,
      })
      if (!parsed.success) {
        const first = parsed.error.issues[0]
        setCreateError(first?.message ?? t("home.validationFailed"))
        return
      }

      setIsCreating(true)
      try {
        const { response, data } = await createResource({
          sellType: "capability",
          capabilityName: parsed.data.capabilityName,
          amount: parsed.data.amount,
          receiverAddress: parsed.data.receiverAddress,
          endpoint: parsed.data.endpoint,
          httpMethod: parsed.data.httpMethod,
          inputFormat: parsed.data.inputFormat,
          resultFormat: parsed.data.resultFormat,
          capabilityExposure: parsed.data.capabilityExposure,
          mcpName: parsed.data.mcpName,
          mcpDescription: parsed.data.mcpDescription,
          mcpType: parsed.data.mcpType,
          mcpRequiresPayment: parsed.data.mcpRequiresPayment,
          deliveryMode: parsed.data.deliveryMode,
          receiptMode: parsed.data.receiptMode,
        })

        const payUrl = data?.paymentUrl?.trim() || data?.qrUrl?.trim() || ""
        if (!response.ok || !data?.ok || !data.resource || !payUrl) {
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
        setPaymentUrl(payUrl)
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
      return
    }

    const labelT = label.trim()
    if (!labelT) {
      setCreateError(t("home.errorLabel"))
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
        if (
          !Number.isFinite(ttl) ||
          (ttl !== 0 && (ttl < 60 || ttl > 604800))
        ) {
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
      } else if (postPaymentUnlockKind === "physical") {
        const ins = physicalInstructions.trim()
        if (!ins) {
          setCreateError(t("home.errorPhysicalInstructions"))
          clearPaymentSuccessState()
          setIsCreating(false)
          return
        }
        if (ins.length > PHYSICAL_INSTRUCTIONS_MAX_LENGTH) {
          setCreateError(
            t("home.errorPhysicalInstructionsLength", {
              max: PHYSICAL_INSTRUCTIONS_MAX_LENGTH,
            }),
          )
          clearPaymentSuccessState()
          setIsCreating(false)
          return
        }
        createPayload = {
          ...basePayload,
          unlockType: "json",
          unlockValue: buildPhysicalUnlockJson(ins),
          deliveryMode: "direct",
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

      const payUrl = data?.paymentUrl?.trim() || data?.qrUrl?.trim() || ""
      if (!response.ok || !data?.ok || !data.resource || !payUrl) {
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
      setPaymentUrl(payUrl)
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
  /** Vertical inset for workflow rail content, sell-type overlay, and related stacks. */
  const homeRailBodyPadY = 4 as const
  const padTop = { base: 4, desktop: 6 } as const
  const padBottom = { base: 8, desktop: 10 } as const
  /**
   * Workflow column (Sell rail): wide layout uses **no** vertical padding on the
   * sticky column so the rail sits flush under the chrome (`top: 64px`) and
   * fills to the bottom of the viewport without a dead band.
   * Narrow layout uses a slightly tighter top inset than the former 32px rail.
   */
  const rightRailPadTop = { base: 3, desktop: 0 } as const

  const contentPadStart = edgePad
  const contentPadEnd = isWide ? ruleGap : edgePad

  /** Horizontal inset for the workflow column body (divider sits outside this for full bleed). */
  const rightColumnInnerPad = isWide
    ? { paddingStart: ruleGap, paddingEnd: { base: 3, desktop: 3 } as const }
    : { paddingStart: edgePad, paddingEnd: edgePad }

  /** Headline only; light proof band + “Why 402” live below. */
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
            fontSize: "24px",
            letterSpacing: "normal",
            paddingBottom: 20,
          }}
        >
          {t("home.heroLine1")}{" "}
          {t("home.heroLine2")}
        </Box>
      </VStack>
    </Box>
  )

  /** Proof band — body copy; highlight uses `backgroundColor` on the paragraph. */
  const homeDemoProofBand = (
    <Box
      width="100%"
      paddingStart={contentPadStart}
      paddingEnd={6}
      paddingBottom={{ base: 2, desktop: 3 }}
    >
      <Box
        borderRadius={400}
        padding={0}
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
                style={{
                  margin: 0,
                  lineHeight: 1.5,
                  width: "100%",
                  backgroundColor: "var(--color-bgLineInverse)",
                }}
              >
                {t("home.demoBandBody")}
              </TextBody>
            </VStack>
          </Box>
        </Box>
      </Box>
    </Box>
  )

  /** “402 Commerce” payment layer — wordmark + Base / USDC / x402 (below Hero, above Resources). */
  const homeCommerceSection = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack gap={6} alignItems="stretch" width="100%" maxWidth="100%">
        <VStack gap={3} alignItems="stretch" width="100%">
          <Box
            as="h2"
            color="fg"
            aria-label={t("home.commerceAriaTitle")}
            style={{ margin: 0, width: "100%" }}
          >
            <HStack
              gap={3}
              alignItems="center"
              flexWrap="wrap"
              width="100%"
            >
              <Box
                as="span"
                font="headline"
                style={HOME_COMMERCE_TITLE_TEXT_STYLE}
              >
                Commerce
              </Box>
            </HStack>
          </Box>
          <VStack gap={4} alignItems="stretch" width="100%" minWidth={0}>
            <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
              <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
                {t("home.commerceIntroHeading1")}
              </TextTitle3>
              <TextBody
                color="fgMuted"
                as="p"
                style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
              >
                {t("home.commerceIntroBody1")}
              </TextBody>
            </VStack>
            <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
              <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
                {t("home.commerceIntroHeading2")}
              </TextTitle3>
              <TextBody
                color="fgMuted"
                as="p"
                style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
              >
                {t("home.commerceIntroBody2")}
              </TextBody>
            </VStack>
          </VStack>
        </VStack>
        <Box
          display="flex"
          flexDirection={isWide ? "row" : "column"}
          alignItems="stretch"
          width="100%"
          minWidth={0}
          style={{ gap: 12 }}
        >
          <Box
            borderRadius={400}
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="100%"
            minWidth={0}
            style={{
              backgroundColor: HOME_AUDIENCE_CREATORS_CARD_BG,
              ...(isWide ? { minWidth: 140 } : {}),
            }}
            padding={{ base: 3, desktop: 4 }}
            flexGrow={isWide ? 1 : undefined}
            flexBasis={isWide ? "140px" : undefined}
          >
            <Box
              as="img"
              key={commerceImages.base}
              src={commerceImages.base}
              alt={t("home.commerceRailBase")}
              flexShrink={0}
              style={HOME_COMMERCE_RAIL_LOGO_STYLE}
            />
          </Box>
          <Box
            borderRadius={400}
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="100%"
            minWidth={0}
            style={{
              backgroundColor: HOME_AUDIENCE_CREATORS_CARD_BG,
              ...(isWide ? { minWidth: 140 } : {}),
            }}
            padding={{ base: 3, desktop: 4 }}
            flexGrow={isWide ? 1 : undefined}
            flexBasis={isWide ? "140px" : undefined}
          >
            <Box
              as="img"
              key={commerceImages.usdc}
              src={commerceImages.usdc}
              alt={t("home.commerceRailUsdc")}
              flexShrink={0}
              style={HOME_COMMERCE_RAIL_LOGO_STYLE}
            />
          </Box>
          <Box
            borderRadius={400}
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="100%"
            minWidth={0}
            style={{
              backgroundColor: HOME_AUDIENCE_CREATORS_CARD_BG,
              ...(isWide ? { minWidth: 140 } : {}),
            }}
            padding={{ base: 3, desktop: 4 }}
            flexGrow={isWide ? 1 : undefined}
            flexBasis={isWide ? "140px" : undefined}
          >
            <Box
              as="img"
              key={commerceImages.x402}
              src={commerceImages.x402}
              alt={t("home.commerceRailX402")}
              flexShrink={0}
              style={HOME_COMMERCE_RAIL_LOGO_STYLE}
            />
          </Box>
        </Box>
      </VStack>
    </Box>
  )

  /** Carousel chrome for audience rows; cards are image + icon/title (CDS layout). */
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
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 38 }}>
        <VStack alignItems="stretch" width="100%" style={{ gap: 24 }}>
          <TextTitle3
            color="fg"
            as="h2"
            style={HOME_SECTION_DISPLAY_HERO_TITLE_STYLE}
          >
            {t("home.audienceCreatorsTitle")}
          </TextTitle3>
          <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
            <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
              {t("home.audienceCreatorsSubhead")}
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
            hidePagination
            styles={{
              ...homeAudienceCarouselStyles,
              navigation: { flexShrink: 0 },
            }}
          >
            {HOME_CREATORS_CARDS.map((card) => (
              <CarouselItem key={card.id} id={card.id}>
                {renderHomeAudienceMessagingCard(card, t)}
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
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 38 }}>
        <VStack alignItems="stretch" width="100%" style={{ gap: 24 }}>
          <TextTitle3
            color="fg"
            as="h2"
            style={HOME_SECTION_DISPLAY_HERO_TITLE_STYLE}
          >
            {t("home.audienceSoftwareTitle")}
          </TextTitle3>
          <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
            <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
              {t("home.audienceSoftwareSubhead")}
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
            hidePagination
            styles={{
              ...homeAudienceCarouselStyles,
              navigation: { flexShrink: 0 },
            }}
          >
            {HOME_SOFTWARE_CARDS.map((card) => (
              <CarouselItem key={card.id} id={card.id}>
                {renderHomeAudienceMessagingCard(card, t)}
              </CarouselItem>
            ))}
          </Carousel>
        </VStack>
      </VStack>
    </Box>
  )

  const homeHowItWorksSection = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 32 }}>
        <TextTitle3
          color="fg"
          as="h2"
          style={HOME_SECTION_DISPLAY_HERO_TITLE_STYLE}
        >
          {t("home.howItWorksTitle")}
        </TextTitle3>
        <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
          <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
            {t("home.howItWorksSubhead")}
          </TextTitle3>
          <TextBody
            color="fgMuted"
            as="p"
            style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
          >
            {t("home.howItWorksBody")}
          </TextBody>
        </VStack>
        <VStack gap={5} alignItems="stretch" width="100%" minWidth={0}>
          <Text
            color="fgMuted"
            font="label2"
            as="p"
            style={{
              margin: 0,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {t("home.howItWorksGroupBasics")}
          </Text>
          <VStack
            as="ol"
            gap={5}
            width="100%"
            minWidth={0}
            margin={0}
            padding={0}
            alignItems="stretch"
            style={{ listStyle: "none" }}
          >
            {howItWorksCoreSteps.map((step, i) => (
              <Box
                as="li"
                key={`home-flow-core-${i}`}
                borderRadius={400}
                width="100%"
                minWidth={0}
                padding={{ base: 5, desktop: 7 }}
                style={{
                  background: "rgb(var(--gray10))",
                }}
              >
                <HStack
                  gap={{ base: 3, desktop: 5 }}
                  alignItems="flex-start"
                  width="100%"
                  minWidth={0}
                >
                  <Box
                    aria-hidden
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    width={48}
                    height={48}
                    borderRadius={1000}
                    background="bgPrimary"
                  >
                    <Text color="fgInverse" font="title3" as="span">
                      {i + 1}
                    </Text>
                  </Box>
                  <VStack gap={2} alignItems="stretch" minWidth={0} style={{ flex: 1, minWidth: 0 }}>
                    <TextTitle4
                      color="fg"
                      as="p"
                      style={{ margin: 0, lineHeight: 1.35 }}
                    >
                      {step.title}
                    </TextTitle4>
                    <TextBody
                      color="fgMuted"
                      as="p"
                      style={{
                        margin: 0,
                        lineHeight: 1.65,
                      }}
                    >
                      {step.body}
                    </TextBody>
                  </VStack>
                </HStack>
              </Box>
            ))}
          </VStack>
        </VStack>
        {howItWorksBuilderSteps.length > 0 ? (
          <VStack gap={4} alignItems="stretch" width="100%" minWidth={0}>
            <Text
              color="fgMuted"
              font="label2"
              as="p"
              style={{
                margin: 0,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t("home.howItWorksGroupBuilder")}
            </Text>
            <VStack
              as="ol"
              gap={5}
              alignItems="stretch"
              width="100%"
              minWidth={0}
              margin={0}
              padding={0}
              style={{ listStyle: "none" }}
            >
              {howItWorksBuilderSteps.map((step, i) => (
                <Box
                  as="li"
                  key={`home-flow-xtra-${i}`}
                  width="100%"
                  minWidth={0}
                  borderRadius={400}
                >
                  <HStack
                    gap={{ base: 3, desktop: 5 }}
                    alignItems="flex-start"
                    width="100%"
                    minWidth={0}
                  >
                    <Box
                      width={4}
                      alignSelf="stretch"
                      flexShrink={0}
                      borderRadius={1000}
                      background="fgPrimary"
                      style={{ minHeight: 48, opacity: 0.45 }}
                    />
                    <VStack
                      gap={2}
                      alignItems="stretch"
                      minWidth={0}
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <TextTitle4
                        color="fg"
                        as="p"
                        style={{ margin: 0, lineHeight: 1.35 }}
                      >
                        {step.title}
                      </TextTitle4>
                      <TextBody
                        color="fgMuted"
                        as="p"
                        style={{ margin: 0, lineHeight: 1.65 }}
                      >
                        {step.body}
                      </TextBody>
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </VStack>
        ) : null}
      </VStack>
    </Box>
  )

  const homeExampleUseCasesSection = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 32 }}>
        <TextTitle3
          color="fg"
          as="h2"
          style={HOME_SECTION_DISPLAY_HERO_TITLE_STYLE}
        >
          {t("home.exampleUseCasesTitle")}
        </TextTitle3>
        <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
          <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
            {t("home.exampleUseCasesSubhead")}
          </TextTitle3>
          <TextBody
            color="fgMuted"
            as="p"
            style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
          >
            {t("home.exampleUseCasesIntro")}
          </TextBody>
        </VStack>
        <Box
          as="ul"
          display="grid"
          width="100%"
          minWidth={0}
          margin={0}
          padding={0}
          style={{
            listStyle: "none",
            gap: 16,
            gridTemplateColumns: isWide
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
          }}
        >
          {why402ExampleLines.map((line, i) => (
            <Box
              as="li"
              key={`home-use-case-${i}`}
              borderRadius={400}
              width="100%"
              minWidth={0}
              display="flex"
              justifyContent="center"
              alignItems="center"
              style={{
                background: "rgb(var(--gray10))",
                margin: 0,
                padding: 14,
                height: "fit-content",
              }}
            >
              <HStack
                alignItems="center"
                justifyContent="center"
                width="100%"
                gap={3}
                minWidth={0}
              >
                <Box
                  minWidth={0}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <TextBody
                    color="fg"
                    as="p"
                    style={{ margin: 0, lineHeight: 1.5 }}
                  >
                    {line}
                  </TextBody>
                </Box>
                <Box
                  aria-hidden
                  display="flex"
                  flexShrink={0}
                  alignItems="center"
                  justifyContent="center"
                  width={32}
                  height={32}
                  borderRadius={1000}
                  background="bgPrimary"
                >
                  <Icon
                    name={HOME_WHY402_EXAMPLE_ICONS[i] ?? "circleCheckmark"}
                    size="s"
                    color="fgInverse"
                  />
                </Box>
              </HStack>
            </Box>
          ))}
        </Box>
      </VStack>
    </Box>
  )

  /** Match `bgSecondary` cards / Payment URL; no stroke until focus (CDS `focusedBorderWidth`). */
  const homeFormTextInputSurface = {
    bordered: false,
    focusedBorderWidth: 100 as const,
    inputBackground: "bgSecondary" as const,
  } as const

  /** Alpha `Select` control uses `InputStack`; `secondary` maps the field fill to `bgSecondary` like `homeFormTextInputSurface`. */
  const homeFormSelectSurface = {
    bordered: false as const,
    compact: true as const,
    variant: "secondary" as const,
    styles: cdsCompactSelectFieldStyles,
  }

  const sellTypeDropdown =
    activeTab.id === "sell" ? (
      <Box display="inline-flex" style={{ width: "auto", maxWidth: "100%" }}>
        <Button
          compact
          variant="secondary"
          borderRadius={500}
          minWidth="auto"
          paddingX={3}
          type="button"
          endIcon="caretDown"
          accessibilityLabel={`${t("home.sellTypeAccessibility")}, ${activeSellTypeDropdownLabel}`}
          aria-haspopup="dialog"
          aria-expanded={sellTypeChooserOpen}
          aria-controls={sellTypeChooserPanelId}
          onClick={() => setSellTypeChooserOpen(true)}
        >
          {activeSellTypeDropdownLabel}
        </Button>
      </Box>
    ) : null

  const homeRailWorkflowHeader = (
    <VStack
      gap={workflowSellTypeBelowRail ? 2 : 0}
      alignItems="stretch"
      width="100%"
    >
      <HStack
        width="100%"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        minWidth={0}
      >
        <Box minWidth={0} flexShrink={1}>
          <SegmentedTabs<HomeRailTabId>
            accessibilityLabel={t("home.railModeLabel")}
            activeTab={activeTab}
            onChange={handleRailTabsChange}
            tabs={railTabs}
            alignSelf="flex-start"
            maxWidth="100%"
          />
        </Box>
        {!workflowSellTypeBelowRail && sellTypeDropdown ? (
          <Box flexShrink={0}>{sellTypeDropdown}</Box>
        ) : null}
      </HStack>
      {workflowSellTypeBelowRail && sellTypeDropdown ? (
        <Box width="100%" minWidth={0}>
          {sellTypeDropdown}
        </Box>
      ) : null}
    </VStack>
  )

  /**
   * Coinbase "Order Types" style chooser. Sits as an absolutely-positioned
   * overlay on top of the rail workflow content, sliding in from the right
   * (and out to the right) via CSS transforms when `sellTypeChooserOpen`
   * toggles. The form layer behind it dims and slides slightly left so the
   * transition reads as a screen swap, not a popover.
   */
  const sellTypeChooserPanel = (
    <VStack
      gap={4}
      alignItems="stretch"
      width="100%"
      paddingY={homeRailBodyPadY}
      style={{ paddingLeft: 20, paddingRight: 20, boxSizing: "border-box" }}
    >
      <HStack
        width="100%"
        alignItems="center"
        gap={2}
        minWidth={0}
        style={{ minHeight: 40 }}
      >
        <Box flexShrink={0}>
          <IconButton
            name="caretLeft"
            variant="secondary"
            type="button"
            accessibilityLabel={t("home.sellTypeChooserBack")}
            onClick={() => setSellTypeChooserOpen(false)}
          />
        </Box>
        <Box
          flexGrow={1}
          minWidth={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <TextTitle3
            as="p"
            color="fg"
            id={sellTypeChooserHeadingId}
            style={{ margin: 0, fontWeight: 700, textAlign: "center" }}
          >
            {t("home.sellTypeChooserTitle")}
          </TextTitle3>
        </Box>
        <Box flexShrink={0} style={{ width: 40, height: 40 }} aria-hidden />
      </HStack>
      <VStack gap={1} alignItems="stretch" width="100%">
        {sellTypeChooserOptions.map((opt) => {
          const isActive = activeSellTypeTab.id === opt.id
          return (
            <Interactable
              key={opt.id}
              type="button"
              onClick={() => handleSellTypeChooserSelect(opt.id)}
              block
              borderRadius={400}
              paddingX={3}
              paddingY={homeRailBodyPadY}
              background={isActive ? "bgSecondary" : "bg"}
              borderColor={isActive ? "bgSecondary" : "bg"}
              borderWidth={0}
              accessibilityLabel={`${opt.title}. ${opt.description}`}
              aria-pressed={isActive}
              blendStyles={{
                hoveredBackground: homeRailTheme.color.bgSecondaryWash,
                pressedBackground: homeRailTheme.color.bgSecondary,
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
                  <Icon name={opt.iconName} size="s" color="fgInverse" />
                </Box>
                <VStack
                  gap={0.5}
                  alignItems="stretch"
                  minWidth={0}
                  flexGrow={1}
                >
                  <TextLabel1
                    as="p"
                    color="fg"
                    style={{ margin: 0, fontWeight: 700 }}
                  >
                    {opt.title}
                  </TextLabel1>
                  <TextBody
                    as="p"
                    color="fgMuted"
                    style={{ margin: 0, lineHeight: 1.4 }}
                  >
                    {opt.description}
                  </TextBody>
                </VStack>
                <Box aria-hidden flexShrink={0} display="flex">
                  <Icon name="caretRight" size="s" color="fgMuted" />
                </Box>
              </HStack>
            </Interactable>
          )
        })}
      </VStack>
    </VStack>
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
          sec === 0
            ? t("home.ttlPresetNone")
            : sec === 900
              ? t("home.ttlPreset15m")
              : sec === 3600
                ? t("home.ttlPreset1h")
                : sec === 86400
                  ? t("home.ttlPreset24h")
                  : t("home.ttlPreset7d"),
      })),
    [t],
  )

  const postPaymentKindSelectOptions = useMemo(
    () => [
      { value: "link", label: t("home.postPaymentKindLink") },
      { value: "physical", label: t("home.postPaymentKindPhysical") },
    ],
    [t],
  )

  /** Match compact `TextInput` / `InputLabel` (label1, fg) for the kind control value. */
  const postPaymentKindSelectSurface = useMemo(
    () => ({
      bordered: false as const,
      borderWidth: 0 as const,
      focusedBorderWidth: 0 as const,
      compact: true as const,
      variant: "secondary" as const,
      blendStyles: {
        hoveredBackground: "transparent",
        pressedBackground: "transparent",
        hoveredOpacity: 1,
        pressedOpacity: 1,
      } as const,
      /** Same token as `InputLabel` on compact fields (e.g. payout wallet). */
      font: "label1" as const,
      /** Select root box defaults to content-width; force it to fill the start slot so
       * caret/text positions don't drift between "Link" and "Physical". */
      style: { width: "100%" } as const,
      styles: {
        ...cdsCompactSelectFieldStyles,
        // Compound field: Select is the left segment — pad insets, square the inner edge
        // where it meets the URL input, round the outer-left corners to match TextInput.
        control: {
          width: "100%",
          minHeight: 62,
          boxSizing: "border-box",
          background: "transparent",
          paddingLeft: 0,
          paddingRight: 0,
          justifyContent: "flex-start",
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        } as const,
        // DefaultSelectControl pads the control (`paddingStart: 1`) and value (`paddingX: 1`),
        // which leaves a visible gap before the secondary fill when embedded in TextInput `start`.
        controlInputNode: {
          ...cdsCompactSelectFieldStyles.controlInputNode,
          width: "100px",
          minHeight: 62,
          paddingInlineStart: 0,
          justifyContent: "flex-start",
          columnGap: 4,
        },
        // Apply the left inset on the value label itself so the caret/text origin
        // matches the URL input's leading edge (instead of padding the outer control).
        controlValueNode: {
          paddingInlineStart: 20,
          paddingInlineEnd: 0,
          flexGrow: 0,
          flexShrink: 0,
          marginInlineEnd: 0,
        },
        /** Keep floating-ui width behavior; only enforce a readable minimum. */
        dropdown: {
          minWidth: 200,
          boxSizing: "border-box" as const,
        },
        optionLabel: {
          whiteSpace: "nowrap",
        },
        /** Default end stack uses `flexGrow: 1`, splitting the control 50/50 and parking the caret at the far edge. */
        controlEndNode: {
          flexGrow: 0,
          marginInlineStart: 0,
          marginLeft: 0,
          paddingInlineStart: 0,
        },
      },
    }),
    [],
  )

  const homeRailAmountHero = (
    <Box
      as="label"
      htmlFor="home-rail-amount"
      width="100%"
      minWidth={0}
      display="block"
      position="relative"
      style={{ marginTop: 12, marginBottom: 20 }}
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
          paddingTop={0}
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

  const homeRailResourceFields = (
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
      {activeDeliveryTab.id === "direct" ? (
        <>
          <Box className="home-postpay-direct-input" width="100%">
            <TextInput
              compact={false}
              {...homeFormTextInputSurface}
              accessibilityLabel={t("home.postPaymentOpens")}
              helperText={
                postPaymentUnlockKind === "physical"
                  ? t("home.postPaymentOpensHelperPhysical")
                  : t("home.postPaymentOpensHelper")
              }
              start={
                <Box
                  className="home-postpay-direct-input__kind"
                  width="auto"
                  minWidth={150}
                  maxWidth="42%"
                  flexShrink={0}
                  flexGrow={0}
                  alignSelf="stretch"
                  display="flex"
                  justifyContent="flex-start"
                >
                  <Select
                    type="single"
                    value={postPaymentUnlockKind}
                    onChange={(next) => {
                      if (next === "link" || next === "physical") {
                        setPostPaymentUnlockKind(next)
                        invalidateQrIfFormChanged()
                      }
                    }}
                    options={postPaymentKindSelectOptions}
                    {...postPaymentKindSelectSurface}
                    accessibilityLabel={t("home.postPaymentKindAccessibility")}
                    controlAccessibilityLabel={t(
                      "home.postPaymentKindAccessibility",
                    )}
                  />
                </Box>
              }
              value={protectedLinkUrl}
              onChange={(e) => {
                setProtectedLinkUrl(e.target.value)
                invalidateQrIfFormChanged()
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("home.postPaymentOpensPlaceholder")}
              readOnly={postPaymentUnlockKind === "physical"}
            />
          </Box>
          {postPaymentUnlockKind === "physical" ? (
            <Box className="home-physical-instructions-input" width="100%">
              <TextInput
                compact={false}
                {...homeFormTextInputSurface}
                label={t("home.physicalInstructionsLabel")}
                helperText={t("home.physicalInstructionsHelper")}
                inputNode={
                  <NativeTextArea
                    className="home-physical-instructions-textarea"
                    compact={false}
                    font="body"
                    value={physicalInstructions}
                    placeholder=""
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                      setPhysicalInstructions(e.target.value)
                      invalidateQrIfFormChanged()
                    }}
                    rows={5}
                    width="100%"
                    style={{
                      minHeight: 120,
                      resize: "vertical" as const,
                      display: "block",
                      textAlign: "start",
                      verticalAlign: "top",
                    }}
                  />
                }
              />
            </Box>
          ) : null}
        </>
      ) : (
        <Box className="home-postpay-protected-url-input" width="100%">
          <TextInput
            compact
            {...homeFormTextInputSurface}
            accessibilityLabel={t("home.postPaymentOpens")}
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
        </Box>
      )}
    </VStack>
  )

  const httpMethodSelectOptions = useMemo(
    () =>
      (["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((m) => ({
        value: m,
        label: m,
      })),
    [],
  )
  const inputFormatSelectOptions = useMemo(
    () => [
      { value: "json", label: "JSON" },
      { value: "form", label: "Form" },
      { value: "query", label: "Query params" },
      { value: "none", label: "None" },
    ],
    [],
  )
  const resultFormatSelectOptions = useMemo(
    () => [
      { value: "json", label: "JSON" },
      { value: "text", label: "Text" },
      { value: "file", label: "File" },
      { value: "redirect", label: "Redirect" },
      { value: "html", label: "HTML" },
    ],
    [],
  )

  const homeRailCapabilityFields = (
    <VStack gap={4} alignItems="stretch" width="100%">
      <TextInput
        compact
        {...homeFormTextInputSurface}
        label={t("home.capabilityName")}
        value={capabilityName}
        onChange={(e) => {
          const v = e.target.value
          setCapabilityName(v)
          if (
            capMcpName.trim() === "" &&
            (capabilityExposure === "mcp" || capabilityExposure === "both")
          ) {
            const s = mcpNameFromCapabilityName(v)
            if (s) setCapMcpName(s)
          }
          invalidateQrIfFormChanged()
        }}
        autoComplete="off"
        spellCheck={false}
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
        label={t("home.endpoint")}
        value={capEndpoint}
        onChange={(e) => {
          setCapEndpoint(e.target.value)
          invalidateQrIfFormChanged()
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("home.endpointPlaceholder")}
      />
      <Select
        type="single"
        value={capHttpMethod}
        onChange={(next) => {
          if (next == null) return
          setCapHttpMethod(String(next))
          invalidateQrIfFormChanged()
        }}
        options={httpMethodSelectOptions}
        label={t("home.method")}
        {...homeFormSelectSurface}
        accessibilityLabel={t("home.method")}
        controlAccessibilityLabel={t("home.method")}
        style={{ width: "100%", minWidth: 0 }}
      />
      <Select
        type="single"
        value={capInputFormat}
        onChange={(next) => {
          if (next == null) return
          setCapInputFormat(String(next))
          invalidateQrIfFormChanged()
        }}
        options={inputFormatSelectOptions}
        label={t("home.inputFormat").replace(/\s/g, "\u00A0")}
        {...homeFormSelectSurface}
        accessibilityLabel={t("home.inputFormat")}
        controlAccessibilityLabel={t("home.inputFormat")}
        style={{ width: "100%", minWidth: 0 }}
      />
      <Select
        type="single"
        value={capResultFormat}
        onChange={(next) => {
          if (next == null) return
          setCapResultFormat(String(next))
          invalidateQrIfFormChanged()
        }}
        options={resultFormatSelectOptions}
        label={t("home.resultFormat").replace(/\s/g, "\u00A0")}
        {...homeFormSelectSurface}
        accessibilityLabel={t("home.resultFormat")}
        controlAccessibilityLabel={t("home.resultFormat")}
        style={{ width: "100%", minWidth: 0 }}
      />
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
          {t("home.capabilityExposure")}
        </TextLabel1>
        <SegmentedTabs<"api" | "mcp" | "both">
          accessibilityLabel={t("home.capabilityExposure")}
          activeTab={{
            id: capabilityExposure,
            label:
              capabilityExposure === "both"
                ? t("home.capabilityExposureBoth")
                : capabilityExposure === "mcp"
                  ? t("home.capabilityExposureMcp")
                  : t("home.capabilityExposureApi"),
          }}
          onChange={(next) => {
            if (!next) return
            if (next.id === "api" || next.id === "mcp" || next.id === "both") {
              setCapabilityExposure(next.id)
              if (
                (next.id === "mcp" || next.id === "both") &&
                capMcpName.trim() === "" &&
                capabilityName.trim() !== ""
              ) {
                setCapMcpName(mcpNameFromCapabilityName(capabilityName))
              }
              invalidateQrIfFormChanged()
            }
          }}
          tabs={[
            { id: "api", label: t("home.capabilityExposureApi") },
            { id: "mcp", label: t("home.capabilityExposureMcp") },
            { id: "both", label: t("home.capabilityExposureBoth") },
          ]}
          alignSelf="flex-start"
          maxWidth="100%"
        />
        <TextBody
          color="fgMuted"
          as="p"
          style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
        >
          {t("home.capabilityExposureHelp")}
        </TextBody>
      </VStack>
      {capabilityExposure === "mcp" || capabilityExposure === "both" ? (
        <VStack gap={3} alignItems="stretch" width="100%">
          <TextBody
            color="fgMuted"
            as="p"
            style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
          >
            {t("home.capabilityMcpFieldsHelp")}
          </TextBody>
          <TextInput
            compact
            {...homeFormTextInputSurface}
            label={t("home.mcpName")}
            value={capMcpName}
            onChange={(e) => {
              setCapMcpName(e.target.value)
              invalidateQrIfFormChanged()
            }}
            autoComplete="off"
          />
          <TextInput
            compact
            {...homeFormTextInputSurface}
            label={t("home.mcpDescription")}
            value={capMcpDescription}
            onChange={(e) => {
              setCapMcpDescription(e.target.value)
              invalidateQrIfFormChanged()
            }}
            autoComplete="off"
          />
          <VStack gap={1} alignItems="stretch" width="100%">
            <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
              {t("home.mcpType")}
            </TextLabel1>
            <SegmentedTabs<"tool" | "resource" | "prompt">
              accessibilityLabel={t("home.mcpType")}
              activeTab={{
                id: capMcpType,
                label:
                  capMcpType === "resource"
                    ? t("home.mcpTypeResource")
                    : capMcpType === "prompt"
                      ? t("home.mcpTypePrompt")
                      : t("home.mcpTypeTool"),
              }}
              onChange={(next) => {
                if (!next) return
                if (
                  next.id === "tool" ||
                  next.id === "resource" ||
                  next.id === "prompt"
                ) {
                  setCapMcpType(next.id)
                  invalidateQrIfFormChanged()
                }
              }}
              tabs={[
                { id: "tool", label: t("home.mcpTypeTool") },
                { id: "resource", label: t("home.mcpTypeResource") },
                { id: "prompt", label: t("home.mcpTypePrompt") },
              ]}
              alignSelf="flex-start"
              maxWidth="100%"
            />
            <TextBody
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
            >
              {capMcpType === "resource"
                ? t("home.mcpTypeHelpResource")
                : capMcpType === "prompt"
                  ? t("home.mcpTypeHelpPrompt")
                  : t("home.mcpTypeHelpTool")}
            </TextBody>
          </VStack>
          <VStack gap={1} alignItems="stretch" width="100%">
            <HStack
              gap={1}
              alignItems="center"
              justifyContent="flex-start"
              minWidth={0}
              flexWrap="wrap"
            >
              <TextLabel1
                color="fg"
                as="span"
                style={{ margin: 0, fontWeight: 600 }}
              >
                {t("home.mcpRequiresPayment")}
              </TextLabel1>
              <Tooltip
                content={t("home.mcpRequiresPaymentClientNote")}
                placement="top"
              >
                <IconButton
                  name="info"
                  type="button"
                  transparent
                  variant="foregroundMuted"
                  compact
                  accessibilityLabel={t("home.mcpRequiresPaymentInfoAria")}
                />
              </Tooltip>
            </HStack>
            <TextBody
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.5, width: "100%" }}
            >
              {t("home.mcpRequiresPaymentLockedBody")}
            </TextBody>
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  )

  const homeRailResourceDeliveryBlock = (
    <VStack gap={3} alignItems="stretch" width="100%">
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

  const homeRailCapabilityExposureAndDeliveryBlock = (
    <VStack gap={3} alignItems="stretch" width="100%">
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
          {t("home.receiptMode")}
        </TextLabel1>
        <SegmentedTabs<"standard" | "detailed">
          accessibilityLabel={t("home.receiptMode")}
          activeTab={{
            id: capReceiptMode,
            label:
              capReceiptMode === "detailed"
                ? t("home.receiptDetailed")
                : t("home.receiptStandard"),
          }}
          onChange={(next) => {
            if (!next) return
            if (next.id === "standard" || next.id === "detailed") {
              setCapReceiptMode(next.id)
              invalidateQrIfFormChanged()
            }
          }}
          tabs={[
            { id: "standard", label: t("home.receiptStandard") },
            { id: "detailed", label: t("home.receiptDetailed") },
          ]}
          alignSelf="flex-start"
          maxWidth="100%"
        />
      </VStack>
      <TextLabel1 color="fg" as="span" style={{ margin: 0, fontWeight: 600 }}>
        {t("home.deliveryMode")}
      </TextLabel1>
      <SegmentedTabs<HomeCapDeliveryTabId>
        accessibilityLabel={t("home.deliveryMode")}
        activeTab={activeCapDeliveryTab}
        onChange={handleCapDeliveryTabsChange}
        tabs={capabilityDeliveryTabs}
        alignSelf="flex-start"
        maxWidth="100%"
      />
      {activeCapDeliveryTab.id === "direct" ? (
        <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
          {t(
            capabilityExposure === "mcp" || capabilityExposure === "both"
              ? "home.capDeliveryDirectHelpMcp"
              : "home.capDeliveryDirectHelp",
          )}
        </TextBody>
      ) : activeCapDeliveryTab.id === "protected" ? (
        <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
          {t(
            capabilityExposure === "mcp" || capabilityExposure === "both"
              ? "home.capDeliveryProtectedHelpMcp"
              : "home.capDeliveryProtectedHelp",
          )}
        </TextBody>
      ) : (
        <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
          {t(
            capabilityExposure === "mcp" || capabilityExposure === "both"
              ? "home.capDeliveryAsyncHelpMcp"
              : "home.capDeliveryAsyncHelp",
          )}
        </TextBody>
      )}
    </VStack>
  )

  const showCapabilityLiveSummary =
    activeSellTypeTab.id === "capability" &&
    capabilityName.trim() !== "" &&
    capEndpoint.trim() !== "" &&
    capHttpMethod.trim() !== ""

  const homeCapabilityLiveSummary = showCapabilityLiveSummary ? (
    <Box
      borderRadius={400}
      background="bgSecondary"
      padding={3}
      width="100%"
      minWidth={0}
    >
      <VStack gap={2} alignItems="stretch" width="100%">
        <TextTitle3 color="fg" as="p" style={{ margin: 0 }}>
          {t("home.capabilitySummaryTitle")}
        </TextTitle3>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.capabilityName")}</TextCaption>
          <TextBody
            color="fg"
            style={{ margin: 0, textAlign: "end", wordBreak: "break-word" }}
          >
            {capabilityName.trim()}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.method")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {capHttpMethod}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.endpoint")}</TextCaption>
          <TextBody
            color="fg"
            style={{ margin: 0, textAlign: "end", wordBreak: "break-word" }}
          >
            {capEndpoint.trim()}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.inputFormat")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {capInputFormat.trim()}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.resultFormat")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {capResultFormat.trim()}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.capabilityExposure")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {capabilityExposure === "both"
              ? t("home.capabilityExposureApiMcp")
              : capabilityExposure === "mcp"
                ? t("home.capabilityExposureMcp")
                : t("home.capabilityExposureApi")}
          </TextBody>
        </HStack>
        {(capabilityExposure === "mcp" || capabilityExposure === "both") ? (
          <HStack
            gap={3}
            justifyContent="space-between"
            alignItems="flex-start"
            width="100%"
          >
            <TextCaption color="fgMuted">{t("home.mcpType")}</TextCaption>
            <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
              {capMcpType === "resource"
                ? t("home.mcpTypeResource")
                : capMcpType === "prompt"
                  ? t("home.mcpTypePrompt")
                  : t("home.mcpTypeTool")}
            </TextBody>
          </HStack>
        ) : null}
        {(capabilityExposure === "mcp" || capabilityExposure === "both") &&
        capMcpName.trim() ? (
          <HStack
            gap={3}
            justifyContent="space-between"
            alignItems="flex-start"
            width="100%"
          >
            <TextCaption color="fgMuted">{t("home.mcpName")}</TextCaption>
            <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
              {capMcpName.trim()}
            </TextBody>
          </HStack>
        ) : null}
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.deliveryMode")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {activeCapDeliveryTab.id === "direct"
              ? t("home.deliveryDirect")
              : activeCapDeliveryTab.id === "protected"
                ? t("home.deliveryProtected")
                : t("home.deliveryAsync")}
          </TextBody>
        </HStack>
        <HStack
          gap={3}
          justifyContent="space-between"
          alignItems="flex-start"
          width="100%"
        >
          <TextCaption color="fgMuted">{t("home.receiptMode")}</TextCaption>
          <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
            {capReceiptMode === "detailed"
              ? t("home.receiptDetailed")
              : t("home.receiptStandard")}
          </TextBody>
        </HStack>
        {createdResource &&
        apiSellType(createdResource) === "capability" &&
        (createdResource.capabilityOriginHost != null ||
          createdResource.capabilityOriginTrust != null) ? (
          <>
            {typeof createdResource.capabilityOriginHost === "string" &&
            createdResource.capabilityOriginHost.trim() !== "" ? (
              <HStack
                gap={3}
                justifyContent="space-between"
                alignItems="flex-start"
                width="100%"
              >
                <TextCaption color="fgMuted">
                  {t("home.capabilityOriginHost")}
                </TextCaption>
                <TextBody
                  color="fg"
                  style={{ margin: 0, textAlign: "end", wordBreak: "break-word" }}
                >
                  {createdResource.capabilityOriginHost}
                </TextBody>
              </HStack>
            ) : null}
            {typeof createdResource.capabilityOriginTrust === "string" ? (
              <HStack
                gap={3}
                justifyContent="space-between"
                alignItems="flex-start"
                width="100%"
              >
                <TextCaption color="fgMuted">
                  {t("home.capabilityTrustStatus")}
                </TextCaption>
                <TextBody color="fg" style={{ margin: 0, textAlign: "end" }}>
                  {createdResource.capabilityOriginTrust}
                </TextBody>
              </HStack>
            ) : null}
            {createdResource.capabilityOriginTrust === "blocked" ? (
              <TextBody color="fgNegative" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("home.capabilityTrustBlockedHint")}
              </TextBody>
            ) : null}
            {createdResource.capabilityOriginTrust === "unverified" ? (
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("home.capabilityTrustUnverifiedHint")}
              </TextBody>
            ) : null}
          </>
        ) : null}
      </VStack>
    </Box>
  ) : null

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
    <Box width="100%" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <Divider />
    </Box>
  )

  const homeSellRailWorkflow = (
    <VStack gap={0} alignItems="stretch" width="100%">
      {homeRailAmountHero}
      {homeSellRule}
      {activeSellTypeTab.id === "resource"
        ? homeRailResourceFields
        : homeRailCapabilityFields}
      {homeSellRule}
      {activeSellTypeTab.id === "resource"
        ? homeRailResourceDeliveryBlock
        : homeRailCapabilityExposureAndDeliveryBlock}
      {activeSellTypeTab.id === "resource" &&
      activeDeliveryTab.id === "protected" ? (
        <>
          {homeSellRule}
          {homeRailProtectedSettings}
        </>
      ) : null}
      {activeSellTypeTab.id === "capability" && homeCapabilityLiveSummary ? (
        <>
          {homeSellRule}
          {homeCapabilityLiveSummary}
        </>
      ) : null}
    </VStack>
  )

  const homeFormSubmit = (
    <VStack
      gap={2}
      alignItems="stretch"
      width="100%"
      paddingTop={3}
      paddingBottom={homeRailBodyPadY}
    >
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
          : activeSellTypeTab.id === "capability"
            ? t("home.createPaidEndpoint")
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
                    {t("home.summarySellType")}
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
                    {apiSellType(createdResource) === "capability"
                      ? t("home.sellTypeCapability")
                      : t("home.sellTypeResource")}
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
                {apiSellType(createdResource) === "capability" ? (
                  <HStack
                    gap={3}
                    alignItems="flex-start"
                    justifyContent="space-between"
                    width="100%"
                    minWidth={0}
                  >
                    <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                      {t("home.capabilityExposure")}
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
                      {createdResource.capabilityExposure === "both"
                        ? t("home.capabilityExposureApiMcp")
                        : createdResource.capabilityExposure === "mcp"
                          ? t("home.capabilityExposureMcp")
                          : t("home.capabilityExposureApi")}
                    </TextBody>
                  </HStack>
                ) : null}
                {apiSellType(createdResource) === "capability" &&
                (createdResource.capabilityExposure === "mcp" ||
                  createdResource.capabilityExposure === "both") ? (
                  <HStack
                    gap={3}
                    alignItems="flex-start"
                    justifyContent="space-between"
                    width="100%"
                    minWidth={0}
                  >
                    <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                      {t("home.mcpType")}
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
                      {createdResource.mcpType === "resource"
                        ? t("home.mcpTypeResource")
                        : createdResource.mcpType === "prompt"
                          ? t("home.mcpTypePrompt")
                          : t("home.mcpTypeTool")}
                    </TextBody>
                  </HStack>
                ) : null}
                {apiSellType(createdResource) === "capability" &&
                (createdResource.capabilityExposure === "mcp" ||
                  createdResource.capabilityExposure === "both") &&
                createdResource.mcpName?.trim() ? (
                  <HStack
                    gap={3}
                    alignItems="flex-start"
                    justifyContent="space-between"
                    width="100%"
                    minWidth={0}
                  >
                    <TextCaption color="fgMuted" as="span" style={{ flexShrink: 0 }}>
                      {t("home.mcpName")}
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
                      {createdResource.mcpName}
                    </TextBody>
                  </HStack>
                ) : null}
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
                    {apiSellType(createdResource) === "capability"
                      ? createdResource.deliveryMode === "async"
                        ? t("home.deliveryAsync")
                        : createdResource.deliveryMode === "protected"
                          ? t("home.deliveryProtected")
                          : t("home.deliveryDirect")
                      : createdResource.deliveryMode === "protected"
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
            </VStack>
          </VStack>
        </Box>

        {apiSellType(createdResource) === "capability" &&
        typeof createdResource.receiverAddress === "string" &&
        createdResource.receiverAddress.trim() !== "" ? (
          <VStack gap={2} alignItems="stretch" width="100%">
            <CapabilityManagePanel
              slug={createdResource.slug}
              receiverAddress={createdResource.receiverAddress}
              onResourceUpdated={handleCapabilityResourceUpdated}
            />
            <Box alignSelf="flex-start">
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                <RouterLink
                  to={`/manage/capability/${encodeURIComponent(createdResource.slug)}?receiver=${encodeURIComponent(createdResource.receiverAddress.trim())}`}
                  style={{ color: "inherit", fontWeight: 600 }}
                >
                  {t("home.capabilityOpenFullManage")}
                </RouterLink>
                {" — "}
                {t("home.capabilityOpenFullManageHint")}
              </TextBody>
              <TextBody color="fgMuted" as="p" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
                <RouterLink
                  to={`/manage/capabilities?receiver=${encodeURIComponent(createdResource.receiverAddress.trim())}`}
                  style={{ color: "inherit", fontWeight: 600 }}
                >
                  {t("home.capabilityOpenOperationsIndex")}
                </RouterLink>
              </TextBody>
            </Box>
          </VStack>
        ) : null}

        <Box
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
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack alignItems="stretch" width="100%" style={{ gap: 32 }}>
        <TextTitle3
          color="fg"
          as="h2"
          style={HOME_SECTION_DISPLAY_HERO_TITLE_STYLE}
        >
          {t("home.why402Heading")}
        </TextTitle3>
        <VStack gap={1} alignItems="stretch" width="100%" minWidth={0}>
          <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
            {t("home.why402Tagline")}
          </TextTitle3>
          <TextBody
            color="fgMuted"
            as="p"
            style={{ margin: 0, lineHeight: 1.6 }}
          >
            {t("home.why402Lead")}
          </TextBody>
        </VStack>
        <Text
          color="fgMuted"
          font="label2"
          as="p"
          style={{
            margin: 0,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {t("home.why402PillarsEyebrow")}
        </Text>
        <Box
          as="ol"
          display="grid"
          width="100%"
          minWidth={0}
          margin={0}
          padding={0}
          style={{
            listStyle: "none",
            gap: 16,
            gridTemplateColumns: isWide
              ? "repeat(3, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
          }}
        >
          {why402PillarCards.map((pillar, i) => (
            <Box
              as="li"
              key={`home-why402-pillar-${i}`}
              borderRadius={400}
              minWidth={0}
              padding={{ base: 5, desktop: 6 }}
              style={{ background: "rgb(var(--gray10))", margin: 0 }}
            >
              <VStack gap={2} alignItems="stretch" minWidth={0}>
                <TextTitle4
                  color="fg"
                  as="p"
                  style={{ margin: 0, lineHeight: 1.4 }}
                >
                  {pillar.title}
                </TextTitle4>
                <TextBody
                  color="fgMuted"
                  as="p"
                  style={{ margin: 0, lineHeight: 1.55 }}
                >
                  {pillar.body}
                </TextBody>
              </VStack>
            </Box>
          ))}
        </Box>
        <Box
          width="100%"
          borderRadius={400}
          background="bgSecondary"
          padding={6}
          minWidth={0}
        >
          <VStack gap={3} alignItems="stretch" width="100%" minWidth={0}>
            <TextBody
              color="fg"
              as="p"
              style={{ margin: 0, lineHeight: 1.55, fontWeight: 600 }}
            >
              {t("home.why402Built")}
            </TextBody>
            <TextBody
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.6 }}
            >
              {t("home.why402Closer")}
            </TextBody>
          </VStack>
        </Box>
      </VStack>
    </Box>
  )

  const homeBottomCta = (
    <Box
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingY={HOME_NARRATIVE_SECTION_PAD_Y}
    >
      <VStack gap={4} alignItems="flex-start" width="100%" maxWidth={680}>
        <TextTitle3 color="fg" as="h2" style={{ margin: 0 }}>
          {t("home.bottomCtaTitle")}
        </TextTitle3>
        <Button
          variant="primary"
          type="button"
          onClick={handleScrollToWorkflow}
          style={{ borderRadius: "100px" }}
        >
          {t("home.bottomCtaButton")}
        </Button>
      </VStack>
    </Box>
  )

  const homeLeftPanelFooter = (
    <Box
      as="footer"
      width="100%"
      minWidth={0}
      paddingStart={contentPadStart}
      paddingEnd={contentPadEnd}
      paddingTop={0}
      style={{ paddingBottom: 30 }}
    >
      <VStack gap={3} alignItems="stretch" width="100%" maxWidth={680}>
        <Divider
          direction="horizontal"
          background="bgLine"
          style={{ width: "100%" }}
        />
        <HStack
          gap={4}
          flexWrap="wrap"
          alignItems="center"
          rowGap={2}
          columnGap={4}
          style={{ marginLeft: 20, marginRight: 20 }}
        >
          <TextCaption color="fgMuted" as="span">
            {t("howItWorks.footerCopyright", {
              year: new Date().getFullYear(),
            })}
          </TextCaption>
          <HStack gap={2} alignItems="center" flexWrap="wrap">
            <RouterLink to="/terms" className="how-it-works-footer-link">
              {t("howItWorks.footerTerms")}
            </RouterLink>
            <TextCaption color="fgMuted" as="span" aria-hidden>
              ·
            </TextCaption>
            <RouterLink to="/privacy" className="how-it-works-footer-link">
              {t("howItWorks.footerPrivacy")}
            </RouterLink>
          </HStack>
        </HStack>
      </VStack>
    </Box>
  )

  /** Wide: narrative column (hero → commerce → resources → … → CTA); workflow + QR live in the right column. */
  const leftPaneDesktop = (
    <VStack gap={0} alignItems="stretch" width="100%" maxWidth="100%">
      {homeHeroLead}
      {homeDemoProofBand}
      <HomeHorizontalRule />
      {homeCommerceSection}
      <HomeHorizontalRule />
      {homeAudienceCreatorsCarousel}
      <HomeHorizontalRule />
      {homeAudienceSoftwareCarousel}
      <HomeHorizontalRule />
      {homeHowItWorksSection}
      <HomeHorizontalRule />
      {homeExampleUseCasesSection}
      <HomeHorizontalRule />
      {homeWhy402}
      <HomeHorizontalRule />
      {homeBottomCta}
      {homeLeftPanelFooter}
    </VStack>
  )

  /**
   * Transaction rail: Sell/Buy/API tabs → amount → fields → delivery → CTA;
   * generated QR/URL live in `homeRailResultSection` below the CTA.
   */
  const showSellTypeChooser = activeTab.id === "sell" && sellTypeChooserOpen

  const rightPane = (
    <Box
      ref={homeWorkflowRailRef}
      id="home-workflow-rail"
      display="flex"
      flexDirection="column"
      width="100%"
      /**
       * Do not set `height="100%"` or `flex: 1 1 0%` here: the desktop rail
       * sits in a sticky column with `maxHeight` + `overflowY: auto`. Forcing
       * this box to the viewport height made the inner `overflow: hidden`
       * wrapper match that height and **clip** everything below the fold
       * (capability receipt mode, delivery mode, create CTA).
       *
       * `minHeight="100%"` only sets a floor: the rail fills the sticky column
       * when content is short so the column’s `background="bg"` reads as one
       * continuous panel top-to-bottom without dead bands below the CTA.
       */
      minHeight={isWide ? "100%" : undefined}
      style={{ alignSelf: "stretch" }}
    >
      <Box
        width="100%"
        height="100%"
        paddingTop={homeRailBodyPadY}
        paddingBottom={homeRailBodyPadY}
        {...rightColumnInnerPad}
        style={{
          position: "relative",
          overflowX: "hidden",
          overflowY: "visible",
        }}
      >
        {/*
         * Form layer (default rail content). When the sell-type chooser opens
         * we slide it slightly left and fade it; it stays mounted so form
         * state and scroll position are preserved underneath the chooser.
         */}
        <Box
          width="100%"
          aria-hidden={showSellTypeChooser}
          style={{
            transform: showSellTypeChooser
              ? "translateX(-12%)"
              : "translateX(0)",
            opacity: showSellTypeChooser ? 0 : 1,
            transition:
              "transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease",
            pointerEvents: showSellTypeChooser ? "none" : "auto",
          }}
        >
          <VStack gap={6} alignItems="stretch" width="100%">
            {homeRailWorkflowHeader}
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
        {/*
         * Chooser overlay (Coinbase-style "Order Types" pattern). Always
         * mounted so the slide-in / slide-out animation runs both ways; we
         * gate interaction with `pointer-events` and ARIA visibility.
         */}
        {activeTab.id === "sell" ? (
          <Box
            id={sellTypeChooserPanelId}
            role="dialog"
            aria-modal={false}
            aria-labelledby={sellTypeChooserHeadingId}
            aria-hidden={!showSellTypeChooser}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              boxSizing: "border-box",
              transform: showSellTypeChooser
                ? "translateX(0)"
                : "translateX(100%)",
              opacity: showSellTypeChooser ? 1 : 0,
              transition:
                "transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease",
              pointerEvents: showSellTypeChooser ? "auto" : "none",
              background: "var(--color-bg)",
            }}
          >
            {sellTypeChooserPanel}
          </Box>
        ) : null}
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
              background="bg"
              paddingTop={rightRailPadTop}
              paddingBottom={0}
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
            <Box
              width="100%"
              background="bg"
              paddingBottom={homeRailBodyPadY}
            >
              {rightPane}
            </Box>
            <HomeHorizontalRule />
            {homeCommerceSection}
            <HomeHorizontalRule />
            {homeAudienceCreatorsCarousel}
            <HomeHorizontalRule />
            {homeAudienceSoftwareCarousel}
            <HomeHorizontalRule />
            {homeHowItWorksSection}
            <HomeHorizontalRule />
            {homeExampleUseCasesSection}
            <HomeHorizontalRule />
            {homeWhy402}
            <HomeHorizontalRule />
            {homeBottomCta}
            {homeLeftPanelFooter}
          </VStack>
        </Box>
      )}
    </Box>
  )
}
