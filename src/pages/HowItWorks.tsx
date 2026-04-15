import { useTranslation } from "react-i18next"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextTitle3 } from "@coinbase/cds-web/typography"

export default function HowItWorks() {
  const { t } = useTranslation()

  return (
    <Box
      as="main"
      width="100%"
      background="bg"
      color="fg"
      minHeight={0}
      paddingTop={{ base: 4, desktop: 6 }}
      paddingBottom={{ base: 5, desktop: 8 }}
      paddingStart={{ base: 3, desktop: 6 }}
      paddingEnd={{ base: 3, desktop: 6 }}
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <VStack gap={2} alignItems="stretch" width="100%" maxWidth={720}>
        <TextTitle3 color="fg" as="h1">
          {t("home.howItWorksTitle")}
        </TextTitle3>
        <TextBody color="fgMuted" as="p">
          {t("home.howItWorksBody")}
        </TextBody>
      </VStack>
    </Box>
  )
}
