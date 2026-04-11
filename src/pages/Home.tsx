import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { TextInput } from "@coinbase/cds-web/controls"
import {
  ContentCard,
  ContentCardBody,
  ContentCardHeader,
} from "@coinbase/cds-web/cards/ContentCard"
import { Box, VStack } from "@coinbase/cds-web/layout"
import {
  TextBody,
  TextCaption,
  TextTitle1,
  TextTitle3,
} from "@coinbase/cds-web/typography"

export default function Home() {
  const [amount, setAmount] = useState("5.00")
  const [label, setLabel] = useState("Tip Jar")
  const [slug, setSlug] = useState("demo-001")

  const paymentUrl = useMemo(() => {
    const origin = window.location.origin
    const path = `/pay/${encodeURIComponent(slug)}`
    return `${origin}${path}`
  }, [slug])

  return (
    <Box
      as="main"
      width="100%"
      display="flex"
      flexDirection="column"
      background="bg"
      color="fg"
      style={{ flex: 1, minHeight: 0 }}
    >
      <Box
        display="flex"
        justifyContent="center"
        width="100%"
        style={{ flex: 1, minHeight: 0 }}
      >
        <Box
          width="100%"
          maxWidth="80rem"
          paddingX={{ base: 2, desktop: 4 }}
          paddingBottom={{ base: 4, desktop: 6 }}
          paddingTop={{ base: 1, desktop: 2 }}
          display="flex"
          flexDirection="column"
          gap={{ base: 4, desktop: 5 }}
        >
          <VStack gap={{ base: 2, desktop: 3 }} alignItems="stretch">
            <Box maxWidth="56rem" width="100%">
              <VStack gap={2} alignItems="stretch">
                <TextTitle1 as="h1" color="fg">
                  Scan. Pay. Get paid.
                </TextTitle1>
                <Box maxWidth="42rem" width="100%">
                  <TextBody as="p" color="fgMuted">
                    QR opens the x402-native pay page for your slug. Amount and
                    label here are preview-only; pricing comes from the worker
                    resource catalog.
                  </TextBody>
                </Box>
              </VStack>
            </Box>
          </VStack>

          <Box
            display="flex"
            flexDirection={{ base: "column", desktop: "row" }}
            gap={{ base: 3, desktop: 4 }}
            alignItems={{ base: "stretch", desktop: "flex-start" }}
          >
            <Box flexGrow={1} flexBasis={0} minWidth={0} width="100%">
              <ContentCard
                width="100%"
                bordered
                background="bgElevation1"
                padding={{ base: 3, desktop: 4 }}
                gap={{ base: 3, desktop: 4 }}
              >
                <ContentCardHeader
                  title={<TextTitle3 color="fg">Create a QR</TextTitle3>}
                />
                <ContentCardBody>
                  <VStack gap={2} alignItems="stretch">
                    <TextInput
                      compact
                      label="Amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="5.00"
                    />
                    <TextInput
                      compact
                      label="Label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Tip Jar"
                    />
                    <TextInput
                      compact
                      label="Slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="my-link"
                    />

                    <Box
                      bordered
                      borderRadius={400}
                      background="bgSecondary"
                      padding={{ base: 2, desktop: 3 }}
                    >
                      <VStack gap={1} alignItems="stretch">
                        <TextCaption
                          color="fgMuted"
                          fontWeight="label1"
                          as="p"
                        >
                          Payment URL
                        </TextCaption>
                        <TextBody mono as="code" color="fg" overflow="wrap">
                          {paymentUrl}
                        </TextBody>
                      </VStack>
                    </Box>
                  </VStack>
                </ContentCardBody>
              </ContentCard>
            </Box>

            <Box flexGrow={1} flexBasis={0} minWidth={0} width="100%">
              <ContentCard
                width="100%"
                bordered
                background="bgElevation1"
                padding={{ base: 3, desktop: 4 }}
                gap={{ base: 3, desktop: 4 }}
              >
                <ContentCardHeader
                  title={<TextTitle3 color="fg">QR Preview</TextTitle3>}
                />
                <ContentCardBody>
                  <VStack gap={{ base: 2, desktop: 3 }} alignItems="center">
                    <Box
                      bordered
                      borderRadius={400}
                      background="bgInverse"
                      padding={{ base: 2, desktop: 3 }}
                    >
                      <QRCodeSVG value={paymentUrl} size={176} />
                    </Box>

                    <VStack gap={1} alignItems="center">
                      <TextTitle3 color="fg">{label}</TextTitle3>
                      <TextTitle1 as="p" color="fg">
                        ${amount}
                      </TextTitle1>
                    </VStack>
                  </VStack>
                </ContentCardBody>
              </ContentCard>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
