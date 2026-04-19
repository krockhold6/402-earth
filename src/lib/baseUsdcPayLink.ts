import type { ApiResource } from "@/lib/api"

/** USDC amount string → uint256 minor units (6 decimals) for EIP-681. */
export function usdcAmountToUint256String(amountStr: string): string | null {
  const t = amountStr.trim()
  if (!t) return null
  const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(t)
  if (!m) return null
  const fracRaw = m[2] ?? ""
  if (fracRaw.length > 6) return null
  const frac = fracRaw.padEnd(6, "0")
  try {
    const minor = BigInt(m[1]) * 1_000_000n + BigInt(frac === "" ? "0" : frac)
    return minor.toString()
  } catch {
    return null
  }
}

/** True when parsed USDC minor units are exactly zero. */
export function isZeroUsdcAmount(amountStr: string): boolean {
  return usdcAmountToUint256String(amountStr.trim()) === "0"
}

/** Human USDC display: trim trailing fractional zeros; keep at least two fraction digits when there is a fractional part. */
export function formatUsdcAmountDisplay(amountStr: string): string {
  const minor = usdcAmountToUint256String(amountStr.trim())
  if (minor === null) return amountStr.trim()
  const n = BigInt(minor)
  const whole = n / 1_000_000n
  let frac = (n % 1_000_000n).toString().padStart(6, "0")
  frac = frac.replace(/0+$/, "")
  if (frac === "") return `${whole.toString()}.00`
  if (frac.length < 2) frac = frac.padEnd(2, "0")
  return `${whole.toString()}.${frac}`
}

export function resourceReceiver(resource: ApiResource): string {
  return (
    resource.paymentReceiverAddress?.trim() ||
    resource.receiverAddress?.trim() ||
    ""
  )
}

/**
 * [EIP-681](https://eips.ethereum.org/EIPS/eip-681) ERC-20 transfer on Base.
 * The browser routes `ethereum:` to the user’s installed wallet (MetaMask, Coinbase Wallet, etc.).
 */
export function buildBaseUsdcEip681Link(resource: ApiResource): string | null {
  const recv = resourceReceiver(resource)
  const token = resource.usdcContractAddress?.trim()
  if (!recv || !token) return null
  if (resource.network.toLowerCase() !== "base") return null
  if (resource.currency.toUpperCase() !== "USDC") return null
  const minor = usdcAmountToUint256String(resource.amount)
  if (!minor) return null
  const chainId = 8453
  return `ethereum:${token.toLowerCase()}@${chainId}/transfer?address=${recv.toLowerCase()}&uint256=${minor}`
}
