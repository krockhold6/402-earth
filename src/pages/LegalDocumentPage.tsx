import { useTranslation } from "react-i18next"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { TextTitle1 } from "@coinbase/cds-web/typography"
import { LegalDocumentBody } from "@/legal/LegalDocumentBody"
import { PRIVACY_POLICY_EN } from "@/legal/privacyEn"
import { TERMS_OF_SERVICE_EN } from "@/legal/termsEn"
import type { LegalPageEn } from "@/legal/types"

type LegalVariant = "terms" | "privacy"

const DOCS: Record<LegalVariant, LegalPageEn> = {
  terms: TERMS_OF_SERVICE_EN,
  privacy: PRIVACY_POLICY_EN,
}

const COPY: Record<LegalVariant, { titleKey: string }> = {
  terms: { titleKey: "legal.termsTitle" },
  privacy: { titleKey: "legal.privacyTitle" },
}

export default function LegalDocumentPage({ variant }: { variant: LegalVariant }) {
  const { t } = useTranslation()
  const { titleKey } = COPY[variant]
  const page = DOCS[variant]

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
        <VStack
          gap={4}
          alignItems="stretch"
          width="100%"
          maxWidth={720}
        >
          <TextTitle1
            color="fg"
            as="h1"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t(titleKey)}
          </TextTitle1>
          <LegalDocumentBody page={page} />
        </VStack>
      </Box>
    </Box>
  )
}
