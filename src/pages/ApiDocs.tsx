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
      paddingTop={{ base: 4, desktop: 6 }}
      paddingX={{ base: 4, desktop: 6 }}
      paddingBottom={{ base: 8, desktop: 10 }}
    >
      <ApiDocsPanel variant="page" />
    </Box>
  )
}
