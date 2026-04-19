type BarcodeDetectorCtor = new (options: {
  formats: string[]
}) => {
  detect: (image: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

async function decodeWithBarcodeDetector(bitmap: ImageBitmap): Promise<string | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector
  if (!BD) return null
  try {
    const detector = new BD({ formats: ["qr_code"] })
    const codes = await detector.detect(bitmap)
    const raw = codes.find((c) => c.rawValue?.trim())?.rawValue?.trim()
    return raw ?? null
  } catch {
    return null
  }
}

async function decodeWithJsQR(bitmap: ImageBitmap): Promise<string | null> {
  const { default: jsQR } = await import("jsqr")
  const { width, height } = bitmap
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, width, height)
  const result = jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth",
  })
  const data = result?.data?.trim()
  return data || null
}

/** Reads the first QR payload from an image file (e.g. camera capture on mobile). */
export async function decodeQrFromImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const fromNative = await decodeWithBarcodeDetector(bitmap)
    if (fromNative) return fromNative
    return await decodeWithJsQR(bitmap)
  } finally {
    bitmap.close()
  }
}
