import { useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

function formatAmount(rawAmount: string | null) {
  const parsed = Number(rawAmount)
  if (Number.isNaN(parsed) || parsed <= 0) return null
  return parsed.toFixed(2)
}

function buildReceiptId() {
  const partA = Math.random().toString(36).slice(2, 8).toUpperCase()
  const partB = Date.now().toString(36).slice(-6).toUpperCase()
  return `402-${partA}-${partB}`
}

export default function Pay() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const [isProcessing, setIsProcessing] = useState(false)

  const label = searchParams.get("label")?.trim() || "Payment"
  const amount = formatAmount(searchParams.get("amount"))

  const isValid = useMemo(() => {
    return Boolean(slug && amount)
  }, [slug, amount])

  const handlePayNow = async () => {
    if (!slug || !amount || isProcessing) return

    setIsProcessing(true)

    const receiptId = buildReceiptId()
    const paidAt = new Date().toISOString()

    await new Promise((resolve) => setTimeout(resolve, 1200))

    const nextParams = new URLSearchParams({
      amount,
      label,
      receipt: receiptId,
      paidAt,
      status: "paid",
    })

    navigate(`/success/${slug}?${nextParams.toString()}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold tracking-tight">
            Payment
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Complete this payment for 402.earth
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-2xl border bg-muted/40 p-5 text-center">
            <p className="text-base font-medium">{label}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {amount ? `$${amount}` : "Invalid amount"}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Slug: {slug ?? "missing"}
            </p>
          </div>

          {!isValid ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              This payment link is missing required information.
            </div>
          ) : null}

          <Button
            type="button"
            className="h-12 w-full rounded-2xl"
            disabled={!isValid || isProcessing}
            onClick={handlePayNow}
          >
            {isProcessing ? "Processing..." : "Pay Now"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            This is the current payment stub flow. Real wallet or x402 execution
            can replace the handler next.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
