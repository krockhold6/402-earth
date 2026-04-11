import { useParams, useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Pay() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()

  const amount = searchParams.get("amount")
  const label = searchParams.get("label")

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-lg font-medium">{label}</p>
          <p className="text-3xl font-bold">${amount}</p>
          <p className="text-sm text-muted-foreground">
            Slug: {slug}
          </p>

          <button type="button" className="w-full rounded-xl bg-black text-white py-3">
            Pay Now
          </button>
        </CardContent>
      </Card>
    </main>
  )
}
