import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-10">
        <h1 className="text-4xl font-semibold">402.earth</h1>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create a QR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />

              <code className="block text-sm break-all">{paymentUrl}</code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>QR</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <QRCodeSVG value={paymentUrl} size={220} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
