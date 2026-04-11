import { useMemo } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

function formatPaidAt(value: string | null) {
  if (!value) return "Unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString()
}

export default function Success() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()

  const label = searchParams.get("label") || "Payment"
  const amount = searchParams.get("amount") || "0.00"
  const receipt = searchParams.get("receipt") || "Unavailable"
  const status = searchParams.get("status") || "unknown"
  const paidAt = formatPaidAt(searchParams.get("paidAt"))

  const statusLabel = useMemo(() => {
    return status === "paid" ? "Paid" : status
  }, [status])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-lg rounded-3xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold tracking-tight">
            Payment received
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your 402.earth payment flow is working.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-2xl border bg-muted/40 p-5">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Label</span>
              <span className="text-sm font-medium">{label}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-medium">${amount}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Slug</span>
              <span className="text-sm font-medium">{slug}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-sm font-medium">{statusLabel}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Receipt</span>
              <span className="text-sm font-medium">{receipt}</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Paid at</span>
              <span className="text-sm font-medium">{paidAt}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-12 flex-1 rounded-2xl">
              <Link to="/">Create another QR</Link>
            </Button>

            <Button asChild variant="outline" className="h-12 flex-1 rounded-2xl">
              <Link
                to={`/pay/${slug}?amount=${encodeURIComponent(amount)}&label=${encodeURIComponent(label)}`}
              >
                Back to payment
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
