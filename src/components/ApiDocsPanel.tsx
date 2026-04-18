import { useTranslation } from "react-i18next"
import { Box, HStack, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle2,
  TextTitle3,
  TextTitle4,
} from "@coinbase/cds-web/typography"

export type ApiDocsPanelVariant = "page" | "rail"

function CodeBlock({
  children,
  compact,
}: {
  children: string
  compact?: boolean
}) {
  return (
    <Box
      as="pre"
      borderRadius={300}
      background="bgSecondary"
      padding={compact ? 2 : 3}
      style={{
        margin: 0,
        overflow: "auto",
        maxHeight: compact ? 200 : undefined,
        fontSize: compact ? 12 : 13,
        lineHeight: 1.45,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        border: "none",
        outline: "none",
      }}
    >
      {children}
    </Box>
  )
}

type ApiDocsPanelProps = {
  variant?: ApiDocsPanelVariant
}

export function ApiDocsPanel({ variant = "page" }: ApiDocsPanelProps) {
  const { t } = useTranslation()
  const isRail = variant === "rail"

  const step1 = `curl -X POST https://api.402.earth/api/payment-attempt \\
  -d '{"slug":"payload-test-001"}'`

  const step2 = `curl https://api.402.earth/x402/pay/<slug>?attemptId=...`

  const step3 = `curl -H "PAYMENT-SIGNATURE: 0x..." ...`

  const resultJson = `{
  "ok": true,
  "status": "paid",
  "resource": {
    "type": "json",
    "value": {
      "title": "Exclusive video",
      "kind": "video",
      "deliveryUrl": "https://402.earth/demo/exclusive-video"
    }
  }
}`

  const gapMain = isRail ? 4 : 5
  const gapSection = isRail ? 3 : 4
  const gapStep = isRail ? 2 : 2

  const replacesBlock = (
    <Box width="100%" minWidth={0}>
      <TextTitle4 color="fg" as="p" style={{ margin: "0 0 10px" }}>
        {t("api.replacesTitle")}
      </TextTitle4>
      <HStack
        gap={4}
        alignItems="flex-start"
        width="100%"
        minWidth={0}
        flexWrap="wrap"
      >
        <Box minWidth={0} style={{ flex: "1 1 140px", minWidth: 0 }}>
          <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 6px" }}>
            {t("api.replacesTraditional")}
          </TextCaption>
          <Box
            as="ul"
            margin={0}
            paddingStart={4}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              listStyleType: "disc",
            }}
          >
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fgMuted" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replacesTraditional1")}
              </TextCaption>
            </Box>
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fgMuted" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replacesTraditional2")}
              </TextCaption>
            </Box>
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fgMuted" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replacesTraditional3")}
              </TextCaption>
            </Box>
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fgMuted" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replacesTraditional4")}
              </TextCaption>
            </Box>
          </Box>
        </Box>
        <Box minWidth={0} style={{ flex: "1 1 140px", minWidth: 0 }}>
          <TextCaption color="fgMuted" as="p" style={{ margin: "0 0 6px" }}>
            {t("api.replaces402")}
          </TextCaption>
          <Box
            as="ul"
            margin={0}
            paddingStart={4}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              listStyleType: "disc",
            }}
          >
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fg" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replaces402_1")}
              </TextCaption>
            </Box>
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fg" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replaces402_2")}
              </TextCaption>
            </Box>
            <Box as="li" style={{ margin: 0 }}>
              <TextCaption color="fg" as="span" style={{ lineHeight: 1.45 }}>
                {t("api.replaces402_3")}
              </TextCaption>
            </Box>
          </Box>
        </Box>
      </HStack>
    </Box>
  )

  return (
    <VStack
      gap={gapMain}
      alignItems="stretch"
      width="100%"
      minWidth={0}
      {...(!isRail
        ? { style: { maxWidth: 720, marginLeft: "auto", marginRight: "auto" } }
        : {})}
    >
      <VStack gap={isRail ? 1 : 2} alignItems="stretch">
        {isRail ? (
          <TextTitle3 as="h2" color="fg" style={{ margin: 0 }}>
            {t("api.heroTitle")}
          </TextTitle3>
        ) : (
          <TextTitle2 as="h1" color="fg" style={{ margin: 0 }}>
            {t("api.heroTitle")}
          </TextTitle2>
        )}
        <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
          {t("api.heroSub")}
        </TextBody>
      </VStack>

      <VStack gap={gapSection} alignItems="stretch">
        <TextTitle3 as="h2" color="fg" style={{ margin: 0 }}>
          {t("api.flowTitle")}
        </TextTitle3>

        <VStack gap={gapStep} alignItems="stretch">
          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("api.step1Title")}
          </TextCaption>
          <CodeBlock compact={isRail}>{step1}</CodeBlock>
        </VStack>

        <VStack gap={gapStep} alignItems="stretch">
          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("api.step2Title")}
          </TextCaption>
          <CodeBlock compact={isRail}>{step2}</CodeBlock>
          <VStack gap={0} paddingStart={1}>
            <TextBody color="fg" as="p" style={{ margin: 0 }}>
              {t("api.step2Status")}
            </TextBody>
            <TextBody color="fg" as="p" style={{ margin: 0 }}>
              {t("api.step2Header")}
            </TextBody>
          </VStack>
        </VStack>

        <VStack gap={gapStep} alignItems="stretch">
          <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
            {t("api.step3Title")}
          </TextCaption>
          <CodeBlock compact={isRail}>{step3}</CodeBlock>
        </VStack>
      </VStack>

      <VStack gap={gapStep} alignItems="stretch">
        <TextTitle3 as="h2" color="fg" style={{ margin: 0 }}>
          {t("api.resultTitle")}
        </TextTitle3>
        <CodeBlock compact={isRail}>{resultJson}</CodeBlock>
        <Box
          borderRadius={400}
          background="bgSecondary"
          padding={isRail ? 3 : 4}
          width="100%"
          style={{ border: "none", outline: "none" }}
        >
          <VStack gap={2} alignItems="stretch" width="100%">
            <TextTitle3
              color="fg"
              as="p"
              style={{
                margin: 0,
                letterSpacing: "-0.03em",
                lineHeight: 1.25,
              }}
            >
              {t("api.killerLine")}
            </TextTitle3>
            <VStack gap={0} alignItems="stretch">
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("api.killerSub1")}
              </TextBody>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("api.killerSub2")}
              </TextBody>
              <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("api.killerSub3")}
              </TextBody>
            </VStack>
          </VStack>
        </Box>
      </VStack>

      {replacesBlock}
    </VStack>
  )
}
