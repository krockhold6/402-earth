import { Button } from "@coinbase/cds-web/buttons"
import { Box } from "@coinbase/cds-web/layout"
import { Text } from "@coinbase/cds-web/typography"

export default function CdsCheck() {
  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      padding={4}
    >
      <Box
        display="flex"
        flexDirection="column"
        gap={4}
        alignItems="center"
        padding={4}
        borderRadius={500}
        background="bgAlternate"
      >
        <Text textAlign="center" fontSize="body" fontWeight="body">
          CDS system check
        </Text>
        <Button>CDS Button Working</Button>
      </Box>
    </Box>
  )
}
