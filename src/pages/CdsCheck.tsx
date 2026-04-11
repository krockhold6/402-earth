import { Button } from "@coinbase/cds-web/buttons"
import { Box, VStack } from "@coinbase/cds-web/layout"
import { Text } from "@coinbase/cds-web/typography"

export default function CdsCheck() {
  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      padding={3}
    >
      <Box
        borderRadius={500}
        background="bgAlternate"
        padding={3}
        maxWidth="26rem"
        width="100%"
      >
        <VStack gap={2} alignItems="center">
          <Text textAlign="center" fontSize="body" fontWeight="body">
            CDS system check
          </Text>
          <Button>CDS Button Working</Button>
        </VStack>
      </Box>
    </Box>
  )
}
