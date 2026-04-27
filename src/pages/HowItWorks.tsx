import { useTranslation } from "react-i18next"
import { Link as RouterLink } from "react-router-dom"
import { Divider } from "@coinbase/cds-web/layout/Divider"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextLabel1,
  TextTitle1,
  TextTitle3,
} from "@coinbase/cds-web/typography"

export default function HowItWorks() {
  const { t } = useTranslation()

  return (
    <Box
      as="main"
      width="100%"
      background="bg"
      color="fg"
      display="flex"
      flexDirection="column"
      minHeight={0}
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        width="100%"
        minHeight={0}
        paddingTop={{ base: 4, desktop: 6 }}
        paddingStart={{ base: 3, desktop: 6 }}
        paddingEnd={{ base: 3, desktop: 6 }}
        style={{
          flex: "1 1 0%",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          boxSizing: "border-box",
        }}
      >
        <VStack
          gap={0}
          alignItems="stretch"
          width="100%"
          maxWidth={720}
          style={{ rowGap: "1.75rem" }}
        >
        <VStack gap={2} alignItems="stretch">
          <TextTitle1 color="fg" as="h1" style={{ letterSpacing: "-0.02em" }}>
            {t("howItWorks.pageTitle")}
          </TextTitle1>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.lede")}
          </TextBody>
        </VStack>

        <VStack gap={3} alignItems="stretch">
          <TextTitle3 color="fg" as="h2">
            {t("howItWorks.flowHeading")}
          </TextTitle3>
          <VStack gap={3} alignItems="stretch">
            <StepBlock
              title={t("howItWorks.step1Title")}
              body={t("howItWorks.step1Body")}
            />
            <StepBlock
              title={t("howItWorks.step2Title")}
              body={t("howItWorks.step2Body")}
            />
            <StepBlock
              title={t("howItWorks.step3Title")}
              body={t("howItWorks.step3Body")}
            />
          </VStack>
        </VStack>

        <VStack gap={2} alignItems="stretch">
          <TextTitle3 color="fg" as="h2">
            {t("howItWorks.underHeading")}
          </TextTitle3>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.underBody1")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.underBody2")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.underBody3")}
          </TextBody>
        </VStack>

        <VStack gap={2} alignItems="stretch">
          <TextTitle3 color="fg" as="h2">
            {t("howItWorks.whyHeading")}
          </TextTitle3>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.whyBody1")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.whyBody2")}
          </TextBody>
        </VStack>

        <VStack gap={2} alignItems="stretch">
          <TextTitle3 color="fg" as="h2">
            {t("howItWorks.trustHeading")}
          </TextTitle3>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.trustBody1")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.trustBody2")}
          </TextBody>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("howItWorks.trustBody3")}
          </TextBody>
        </VStack>

        <TextBody
          color="fg"
          as="p"
          style={{ margin: 0, fontWeight: 600 }}
        >
          {t("howItWorks.closing")}
        </TextBody>

        <Box
          as="footer"
          width="100%"
          paddingTop={4}
          style={{ marginTop: "2rem" }}
        >
          <Divider
            direction="horizontal"
            background="bgLine"
            style={{ marginBottom: "1rem" }}
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
              {t("howItWorks.footerCopyright")}
            </TextCaption>
            <HStack gap={2} alignItems="center" flexWrap="wrap">
              <RouterLink
                to="/terms"
                className="how-it-works-footer-link"
              >
                {t("howItWorks.footerTerms")}
              </RouterLink>
              <TextCaption color="fgMuted" as="span" aria-hidden>
                ·
              </TextCaption>
              <RouterLink
                to="/privacy"
                className="how-it-works-footer-link"
              >
                {t("howItWorks.footerPrivacy")}
              </RouterLink>
            </HStack>
          </HStack>
        </Box>

        <Box
          aria-hidden
          width="100%"
          flexShrink={0}
          minHeight="calc(60px + env(safe-area-inset-bottom, 0px))"
        />
      </VStack>
      </Box>
    </Box>
  )
}

function StepBlock({ title, body }: { title: string; body: string }) {
  return (
    <VStack gap={1} alignItems="stretch">
      <TextLabel1 color="fg" as="h3">
        {title}
      </TextLabel1>
      <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
        {body}
      </TextBody>
    </VStack>
  )
}
