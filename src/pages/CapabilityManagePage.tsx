import { Link as RouterLink } from "react-router-dom"
import { useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextTitle3 } from "@coinbase/cds-web/typography"
import { CapabilityManagePanel } from "@/components/CapabilityManagePanel"

const pagePaddingX = { base: 2, desktop: 4 } as const
const pagePaddingY = { base: 3, desktop: 5 } as const

export default function CapabilityManagePage() {
  const { t } = useTranslation()
  const { slug: slugParam } = useParams()
  const [searchParams] = useSearchParams()
  const slug = slugParam?.trim() ?? ""
  const receiver = searchParams.get("receiver")?.trim() ?? ""

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      alignItems="center"
      background="bg"
      color="fg"
      style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto" }}
    >
      <Box
        width="100%"
        maxWidth="40rem"
        paddingX={pagePaddingX}
        paddingY={pagePaddingY}
      >
        <VStack gap={3} alignItems="stretch" width="100%">
          <RouterLink
            to="/"
            style={{
              textDecoration: "none",
              alignSelf: "flex-start",
            }}
          >
            <TextCaption color="fgMuted" as="span">
              ← {t("capabilityManage.backHome")}
            </TextCaption>
          </RouterLink>
          <VStack gap={1} alignItems="stretch">
            <TextTitle3 color="fg" as="h1" style={{ margin: 0 }}>
              {t("capabilityManage.pageTitle")}
            </TextTitle3>
            <TextBody color="fgMuted" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
              {t("capabilityManage.pageIntro")}
            </TextBody>
          </VStack>
          {!slug || !receiver ? (
            <Box
              bordered
              borderRadius={400}
              background="bgWarningWash"
              padding={3}
            >
              <TextBody color="fg" as="p" style={{ margin: 0, lineHeight: 1.5 }}>
                {t("capabilityManage.missingQuery")}
              </TextBody>
            </Box>
          ) : (
            <CapabilityManagePanel
              slug={slug}
              receiverAddress={receiver}
              onResourceUpdated={() => {
                /* dedicated page has no parent resource state */
              }}
              showOuterTitle={false}
            />
          )}
        </VStack>
      </Box>
    </Box>
  )
}
