import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link as RouterLink } from "react-router-dom"
import { Button } from "@coinbase/cds-web/buttons"
import { useTheme } from "@coinbase/cds-web/hooks/useTheme"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  Text,
  TextBody,
  TextCaption,
  TextLabel1,
  TextTitle1,
  TextTitle3,
  TextTitle4,
} from "@coinbase/cds-web/typography"

const DEMO_SLUG = "payload-test-001"
const DEMO_PAY_PATH = `/x402/pay/${DEMO_SLUG}`
const DEMO_PAY_URL = `https://402.earth${DEMO_PAY_PATH}`
const DEMO_TX_PREFIX = "0xdeadbeef…"

/** ~CDS `PageHeader` height + air — used for `scroll-padding-top` on in-page anchors (e.g. #demo-flow). */
const DEMO_SCROLL_PADDING_TOP = "calc(env(safe-area-inset-top, 0px) + 80px)"

const PAYOFF_JSON = `{
  "title": "Exclusive video",
  "kind": "video",
  "deliveryUrl": "https://402.earth/demo/exclusive-video"
}`

function LiveEndpointButton() {
  const { t } = useTranslation()
  return (
    <Button
      as="a"
      href={DEMO_PAY_URL}
      target="_blank"
      rel="noreferrer"
      variant="primary"
      type="button"
      borderRadius={500}
      minHeight={52}
      paddingX={5}
    >
      {t("demo.ctaLiveEndpoint")}
    </Button>
  )
}

function PremiumJsonBlock({ children }: { children: string }) {
  return (
    <Box
      borderRadius={500}
      padding={{ base: 5, desktop: 6 }}
      width="100%"
      minWidth={0}
      bordered
      borderColor="bgLine"
      background="bgSecondary"
    >
      <Box
        as="pre"
        margin={0}
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          fontSize: "clamp(14px, 2.1vw, 17px)",
          lineHeight: 1.55,
          letterSpacing: "-0.01em",
          color: "var(--color-fg)",
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

function FlowStep({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <HStack gap={4} alignItems="flex-start" width="100%" minWidth={0}>
      <Box
        flexShrink={0}
        width={36}
        height={36}
        borderRadius={1000}
        display="flex"
        alignItems="center"
        justifyContent="center"
        style={{
          background: theme.color.bgPrimary,
        }}
        aria-hidden
      >
        <Text as="span" font="label1" color="fgInverse" fontWeight="label1">
          {n}
        </Text>
      </Box>
      <VStack gap={2} alignItems="stretch" flexGrow={1} minWidth={0}>
        <TextTitle3 color="fg" as="h3" style={{ margin: 0, lineHeight: 1.25 }}>
          {title}
        </TextTitle3>
        {children}
      </VStack>
    </HStack>
  )
}

export default function Demo() {
  const { t } = useTranslation()

  return (
    <Box
      as="main"
      width="100%"
      background="bg"
      color="fg"
      minHeight={0}
      paddingTop={{ base: 6, desktop: 10 }}
      paddingBottom={{ base: 10, desktop: 10 }}
      paddingStart={{ base: 3, desktop: 6 }}
      paddingEnd={{ base: 3, desktop: 6 }}
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        boxSizing: "border-box",
        scrollPaddingTop: DEMO_SCROLL_PADDING_TOP,
      }}
    >
      <Box
        width="100%"
        maxWidth={720}
        display="flex"
        flexDirection="column"
        alignItems="stretch"
        style={{
          marginInline: "auto",
          rowGap: "clamp(3rem, 8vw, 5.5rem)",
        }}
      >
          {/* 1. Hero */}
          <VStack
            gap={{ base: 4, desktop: 5 }}
            alignItems="flex-start"
            width="100%"
            minWidth={0}
          >
            <TextTitle1
              color="fg"
              as="h1"
              style={{
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
                fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
                fontWeight: 700,
                margin: 0,
                maxWidth: "18ch",
              }}
            >
              {t("demo.heroTitle")}
            </TextTitle1>
            <TextTitle4
              color="fgMuted"
              as="p"
              style={{
                margin: 0,
                lineHeight: 1.45,
                fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
                maxWidth: "36ch",
              }}
            >
              {t("demo.heroSubtitle")}
            </TextTitle4>
            <HStack
              gap={3}
              alignItems="center"
              flexWrap="wrap"
              paddingTop={2}
            >
              <LiveEndpointButton />
              <Button
                as="a"
                href="#demo-flow"
                variant="secondary"
                type="button"
                borderRadius={500}
                minHeight={52}
                paddingX={5}
              >
                {t("demo.ctaViewFlow")}
              </Button>
            </HStack>
          </VStack>

          {/* 2. Payoff */}
          <VStack
            gap={{ base: 3, desktop: 4 }}
            alignItems="stretch"
            width="100%"
            id="demo-payoff"
          >
            <TextLabel1
              color="fg"
              as="p"
              style={{ margin: 0, letterSpacing: "0.04em", fontWeight: 700 }}
            >
              {t("demo.payoffLabel")}
            </TextLabel1>
            <PremiumJsonBlock children={PAYOFF_JSON} />
            <TextCaption
              color="fgMuted"
              as="p"
              style={{ margin: 0, lineHeight: 1.5, fontSize: 15 }}
            >
              {t("demo.payoffFoot")}
            </TextCaption>
          </VStack>

          {/* 3. Flow */}
          <Box id="demo-flow" width="100%">
          <VStack
            gap={{ base: 5, desktop: 6 }}
            alignItems="stretch"
            width="100%"
          >
            <TextCaption
              color="fgMuted"
              as="p"
              style={{ margin: 0, fontWeight: 700, letterSpacing: "0.12em" }}
            >
              {t("demo.flowEyebrow")}
            </TextCaption>

            <FlowStep n={1} title={t("demo.flow1Title")}>
              <Box
                borderRadius={400}
                background="bgSecondary"
                paddingX={4}
                paddingY={3}
                width="100%"
                minWidth={0}
                style={{ overflowX: "auto" }}
              >
                <TextBody mono color="fg" as="p" style={{ margin: 0 }}>
                  GET {DEMO_PAY_PATH}
                </TextBody>
              </Box>
            </FlowStep>

            <FlowStep n={2} title={t("demo.flow2Title")}>
              <VStack gap={2} alignItems="stretch">
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("demo.flow2Bullet402")}
                </TextBody>
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("demo.flow2BulletAmount")}
                </TextBody>
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("demo.flow2BulletNetwork")}
                </TextBody>
              </VStack>
            </FlowStep>

            <FlowStep n={3} title={t("demo.flow3Title")}>
              <VStack gap={3} alignItems="stretch">
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("demo.flow3Line1")}
                </TextBody>
                <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
                  {t("demo.flow3Line2")}
                </TextBody>
                <Box
                  borderRadius={400}
                  background="bgSecondary"
                  paddingX={4}
                  paddingY={3}
                  width="100%"
                  minWidth={0}
                >
                  <TextBody mono color="fg" as="p" style={{ margin: 0 }}>
                    {DEMO_TX_PREFIX}
                  </TextBody>
                </Box>
              </VStack>
            </FlowStep>

            <FlowStep n={4} title={t("demo.flow4Title")}>
              <VStack gap={3} alignItems="stretch">
                <Box
                  borderRadius={400}
                  background="bgSecondary"
                  paddingX={4}
                  paddingY={3}
                  width="100%"
                  minWidth={0}
                  style={{ overflowX: "auto" }}
                >
                  <TextBody mono color="fg" as="p" style={{ margin: 0 }}>
                    PAYMENT-SIGNATURE: {DEMO_TX_PREFIX}
                  </TextBody>
                </Box>
                <TextBody color="fg" as="p" style={{ margin: 0, fontWeight: 600 }}>
                  {t("demo.flow4Outcome")}
                </TextBody>
              </VStack>
            </FlowStep>
          </VStack>
          </Box>

          {/* 4. Why */}
          <VStack gap={3} alignItems="stretch" width="100%" maxWidth={480}>
            <TextBody
              color="fg"
              as="p"
              style={{ margin: 0, fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}
            >
              {t("demo.why1")}
            </TextBody>
            <TextBody
              color="fg"
              as="p"
              style={{ margin: 0, fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}
            >
              {t("demo.why2")}
            </TextBody>
            <TextBody
              color="fg"
              as="p"
              style={{ margin: 0, fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}
            >
              {t("demo.why3")}
            </TextBody>
          </VStack>

          {/* 5. Live CTA repeat */}
          <VStack gap={3} alignItems="flex-start">
            <LiveEndpointButton />
          </VStack>

          <Box as="footer" width="100%" paddingTop={4}>
            <Divider
              direction="horizontal"
              background="bgLine"
              style={{ marginBottom: "1.25rem" }}
            />
            <HStack gap={4} flexWrap="wrap" alignItems="center">
              <TextCaption color="fgMuted" as="span">
                {t("demo.footerCopyright")}
              </TextCaption>
              <HStack gap={2} flexWrap="wrap">
                <RouterLink to="/terms" className="how-it-works-footer-link">
                  {t("demo.footerTerms")}
                </RouterLink>
                <TextCaption color="fgMuted" aria-hidden>
                  ·
                </TextCaption>
                <RouterLink to="/privacy" className="how-it-works-footer-link">
                  {t("demo.footerPrivacy")}
                </RouterLink>
              </HStack>
            </HStack>
          </Box>

          <Box
            aria-hidden
            width="100%"
            flexShrink={0}
            minHeight="calc(40px + env(safe-area-inset-bottom, 0px))"
          />
      </Box>
    </Box>
  )
}
