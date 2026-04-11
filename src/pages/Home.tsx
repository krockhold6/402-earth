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
  TextDisplay2,
  TextTitle1,
  TextTitle3,
} from "@coinbase/cds-web/typography"

export default function Home() {
  const [amount, setAmount] = useState("5.00")
  const [label, setLabel] = useState("Tip Jar")
  const [slug, setSlug] = useState("demo-001")

  const paymentUrl = useMemo(() => {
    const params = new URLSearchParams({
      amount,
      label,
    })

    return `${window.location.origin}/pay/${slug}?${params.toString()}`
  }, [amount, label, slug])

  return (
    <Box as="main" minHeight="100vh" background="bg" color="fg">
      <Box display="flex" justifyContent="center" width="100%">
        <Box
          width="100%"
          maxWidth="80rem"
          paddingX={{ base: 3, desktop: 6 }}
          paddingBottom={{ base: 6, desktop: 10 }}
          paddingTop={{ base: 2, desktop: 4 }}
          display="flex"
          flexDirection="column"
          gap={{ base: 6, desktop: 10 }}
        >
          <VStack gap={{ base: 4, desktop: 6 }} alignItems="stretch">
            <Box maxWidth="56rem" width="100%">
              <VStack gap={4} alignItems="stretch">
                <TextDisplay2 as="h1" color="fg">
                  Scan. Pay. Get paid.
                </TextDisplay2>
                <Box maxWidth="42rem" width="100%">
                  <TextBody as="p" color="fgMuted">
                    Generate a branded payment QR in seconds. Built for instant
                    digital payments today and the x402 future tomorrow.
                  </TextBody>
                </Box>
              </VStack>
            </Box>
          </VStack>

          <Box
            display="flex"
            flexDirection={{ base: "column", desktop: "row" }}
            gap={{ base: 4, desktop: 6 }}
            alignItems={{ base: "stretch", desktop: "flex-start" }}
          >
            <Box flexGrow={1} flexBasis={0} minWidth={0} width="100%">
              <ContentCard
                width="100%"
                bordered
                borderRadius={500}
                background="bgElevation1"
                padding={{ base: 4, desktop: 6 }}
                gap={{ base: 4, desktop: 6 }}
              >
                <ContentCardHeader
                  title={<TextTitle3 color="fg">Create a QR</TextTitle3>}
                />
                <ContentCardBody>
                  <VStack gap={3} alignItems="stretch">
                    <TextInput
                      label="Amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="5.00"
                      borderRadius={400}
                    />
                    <TextInput
                      label="Label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Tip Jar"
                      borderRadius={400}
                    />
                    <TextInput
                      label="Slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="my-link"
                      borderRadius={400}
                    />

                    <Box
                      bordered
                      borderRadius={400}
                      background="bgSecondary"
                      padding={{ base: 3, desktop: 4 }}
                    >
                      <VStack gap={2} alignItems="stretch">
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
                borderRadius={500}
                background="bgElevation1"
                padding={{ base: 4, desktop: 6 }}
                gap={{ base: 4, desktop: 6 }}
              >
                <ContentCardHeader
                  title={<TextTitle3 color="fg">QR Preview</TextTitle3>}
                />
                <ContentCardBody>
                  <VStack gap={{ base: 4, desktop: 6 }} alignItems="center">
                    <Box
                      bordered
                      borderRadius={600}
                      background="bgInverse"
                      padding={{ base: 3, desktop: 5 }}
                    >
                      <QRCodeSVG value={paymentUrl} size={220} />
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
