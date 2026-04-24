import { useTranslation } from "react-i18next"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { TextBody, TextCaption, TextLabel1 } from "@coinbase/cds-web/typography"
import type { LegalPageEn } from "./types"

export function LegalDocumentBody({ page }: { page: LegalPageEn }) {
  const { t } = useTranslation()
  return (
    <VStack
      gap={0}
      alignItems="stretch"
      width="100%"
      style={{ rowGap: "1.75rem" }}
    >
      <VStack gap={1} alignItems="stretch">
        <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
          {t("legal.effectiveDate")}: {page.effectiveDate}
        </TextCaption>
        <TextCaption color="fgMuted" as="p" style={{ margin: 0 }}>
          {t("legal.lastUpdated")}: {page.lastUpdated}
        </TextCaption>
      </VStack>
      {page.preface.map((para, i) => (
        <TextBody
          key={`pre-${i}`}
          color="fgMuted"
          as="p"
          style={{ margin: 0 }}
        >
          {para}
        </TextBody>
      ))}
      {page.sections.map((section) => (
        <VStack
          key={section.title}
          gap={2}
          alignItems="stretch"
        >
          <TextLabel1
            color="fg"
            as="h2"
            style={{ margin: 0, fontWeight: 600 }}
          >
            {section.title}
          </TextLabel1>
          {section.blocks.map((b, j) => {
            if (b.type === "p") {
              return (
                <TextBody
                  key={j}
                  color="fgMuted"
                  as="p"
                  style={{ margin: 0 }}
                >
                  {b.text}
                </TextBody>
              )
            }
            return (
              <Box
                as="ul"
                key={j}
                color="fgMuted"
                display="block"
                style={{
                  margin: 0,
                  paddingLeft: "1.25rem",
                  listStyleType: "disc",
                  listStylePosition: "outside",
                }}
              >
                {b.items.map((item, k) => (
                  <TextBody
                    as="li"
                    key={k}
                    color="fgMuted"
                    display="list-item"
                    style={{ marginBottom: "0.35rem" }}
                  >
                    {item}
                  </TextBody>
                ))}
              </Box>
            )
          })}
        </VStack>
      ))}
    </VStack>
  )
}
