import QRCode from 'qrcode'

/** PNG bitmap as base64 (no data-URL prefix), suitable for Resend attachments. */
export async function qrPngBase64ForUrl(url: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(url, {
    type: 'image/png',
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('Unexpected QR output')
  }
  return dataUrl.slice(prefix.length)
}
