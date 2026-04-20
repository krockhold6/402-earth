import { publicUrl } from "./publicUrl"

/** Center mark size as a fraction of total QR pixel size (works with level H). */
const CENTER_FRACTION = 0.22

/**
 * Settings for `qrcode.react` embedded image: blue .earth circle from `public/img/`.
 */
export function qrCenterImageSettings(qrPixelSize: number) {
  const n = Math.max(24, Math.round(qrPixelSize * CENTER_FRACTION))
  return {
    src: publicUrl("img/blue-qr-circle.svg"),
    height: n,
    width: n,
    excavate: true,
  }
}
