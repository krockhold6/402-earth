import { Box } from "@coinbase/cds-web/layout"
import { ApiDocsPanel } from "@/components/ApiDocsPanel"

export default function ApiDocs() {
  return (
    <Box
      as="main"
      width="100%"
      minHeight={0}
      style={{ flex: "1 1 0%", overflowY: "auto" }}
      background="bg"
      color="fg"
      padding={{ base: 4, desktop: 6 }}
    >
      <ApiDocsPanel variant="page" />
    </Box>
  )
}
