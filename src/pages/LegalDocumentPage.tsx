import { useTranslation } from "react-i18next"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextTitle3 } from "@coinbase/cds-web/typography"

type LegalVariant = "terms" | "privacy"

const COPY: Record<
  LegalVariant,
  { titleKey: string; bodyKey: string }
> = {
  terms: {
    titleKey: "legal.termsTitle",
    bodyKey: "legal.termsStub",
  },
  privacy: {
    titleKey: "legal.privacyTitle",
    bodyKey: "legal.privacyStub",
  },
}

export default function LegalDocumentPage({ variant }: { variant: LegalVariant }) {
  const { t } = useTranslation()
  const keys = COPY[variant]

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
          paddingBottom:
            "max(2.5rem, calc(env(safe-area-inset-bottom, 0px) + 2rem))",
        }}
      >
        <VStack gap={3} alignItems="stretch" width="100%" maxWidth={720}>
          <TextTitle3 color="fg" as="h1">
            {t(keys.titleKey)}
          </TextTitle3>
          <TextBody color="fgMuted" as="p" style={{ margin: 0 }}>
            {t(keys.bodyKey)}
          </TextBody>
        </VStack>
      </Box>
    </Box>
  )
}
