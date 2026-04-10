import { useMemo, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function App() {
  const [amount, setAmount] = useState("5.00")
  const [label, setLabel] = useState("Tip Jar")
  const [slug, setSlug] = useState("demo-001")

  const paymentUrl = useMemo(() => {
    const params = new URLSearchParams({
      amount,
      label,
    })

    return `https://402.earth/pay/${slug}?${params.toString()}`
  }, [amount, label, slug])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 pt-8 pb-2 md:px-8 md:pt-10 md:pb-3">
        <a
          href="/"
          className="inline-flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="402.earth home"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 259 126"
            fill="none"
            className="h-9 w-auto text-foreground md:h-10"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M31.985 82.671H0V70.274l31.607-40.407h12.397v41.921h9.936v10.883h-9.936v13.438H31.985V82.67Zm0-10.883V46.711L12.302 71.788h19.683ZM133.512.005c34.413.436 62.173 28.466 62.173 62.982 0 34.788-28.2 62.988-62.987 62.988-34.788 0-62.988-28.2-62.988-62.988S97.91 0 132.698 0l.814.005Zm-21.989 68.304c.58 13.151 3.283 24.757 7.189 33.222 4.635 10.042 9.964 13.801 13.986 13.801 4.021 0 9.35-3.759 13.985-13.801 3.907-8.465 6.609-20.07 7.189-33.222h-42.349Zm-30.902 0c1.928 19.097 14.123 35.164 30.981 42.596a57.62 57.62 0 0 1-2.555-4.915c-4.641-10.058-7.591-23.238-8.176-37.681h-20.25Zm83.904 0c-.586 14.443-3.535 27.623-8.177 37.681a57.058 57.058 0 0 1-2.556 4.915c16.858-7.432 29.054-23.498 30.983-42.596h-20.25Zm-52.923-53.24c-16.858 7.432-29.053 23.5-30.981 42.597h20.25c.585-14.444 3.535-27.624 8.176-37.682a57.668 57.668 0 0 1 2.555-4.916Zm21.096-4.426c-4.022 0-9.351 3.758-13.986 13.8-3.906 8.465-6.609 20.071-7.189 33.223h42.349c-.58-13.151-3.282-24.758-7.189-33.223-4.635-10.042-9.964-13.8-13.985-13.8Zm21.094 4.425a57.092 57.092 0 0 1 2.556 4.916c4.642 10.058 7.591 23.238 8.177 37.682h20.25c-1.929-19.098-14.124-35.165-30.983-42.598Zm57.665 70.062 22.522-21.196c4.164-3.912 6.971-6.877 8.422-8.896 1.451-2.019 2.177-4.164 2.177-6.435 0-2.397-.82-4.384-2.461-5.962-1.64-1.577-3.753-2.365-6.34-2.365h-.946c-2.902 0-5.3.978-7.192 2.933-1.893 1.893-2.871 4.511-2.934 7.855h-12.586c0-4.416.978-8.265 2.934-11.545 2.019-3.28 4.763-5.773 8.233-7.476 3.533-1.767 7.507-2.65 11.923-2.65 4.353 0 8.17.82 11.451 2.46 3.343 1.578 5.93 3.786 7.759 6.625 1.83 2.839 2.745 6.056 2.745 9.652 0 4.038-.947 7.634-2.839 10.788-1.893 3.091-5.142 6.75-9.747 10.977L227.355 85.7h30.755v10.88h-46.653V85.13Z"
            />
          </svg>
        </a>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pb-10 pt-4 md:px-8 md:pb-14 md:pt-6">
        <section className="flex flex-col gap-6">
          <div className="max-w-4xl space-y-4">
            <h1 className="text-4xl leading-none font-semibold tracking-tight md:text-6xl">
              Scan. Pay. Get paid.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              Generate a branded payment QR in seconds. Built for instant digital
              payments today and the x402 future tomorrow.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-3xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Create a QR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="5.00"
                  className="h-12 rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Label</label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Tip Jar"
                  className="h-12 rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-link"
                  className="h-12 rounded-2xl"
                />
              </div>

              <div className="rounded-2xl border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-medium tracking-[0.14em] uppercase text-muted-foreground">
                  Payment URL
                </p>
                <code className="block break-all text-sm leading-6">
                  {paymentUrl}
                </code>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">QR Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-6">
              <div className="rounded-[28px] border bg-white p-5 shadow-sm">
                <QRCodeSVG value={paymentUrl} size={220} />
              </div>

              <div className="space-y-1 text-center">
                <p className="text-lg font-medium">{label}</p>
                <p className="text-3xl font-semibold tracking-tight">${amount}</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

export default App
