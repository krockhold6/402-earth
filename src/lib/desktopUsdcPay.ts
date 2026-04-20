import type { ApiResource } from "@/lib/api"
import {
  resourceReceiver,
  usdcAmountToUint256String,
} from "@/lib/baseUsdcPayLink"
import {
  type Address,
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
} from "viem"
import { base } from "viem/chains"

const BASE_CHAIN_ID_HEX = "0x2105" as const

export type DesktopPayErrorCode =
  | "NO_WALLET"
  | "INVALID_RESOURCE"
  | "USER_REJECTED"
  | "UNKNOWN"

export class DesktopPayError extends Error {
  readonly code: DesktopPayErrorCode

  constructor(code: DesktopPayErrorCode, message?: string) {
    super(message ?? code)
    this.name = "DesktopPayError"
    this.code = code
  }
}

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function getEip1193(): Eip1193Provider | null {
  if (typeof window === "undefined") return null
  const eth = (window as unknown as { ethereum?: unknown }).ethereum
  if (!eth || typeof eth !== "object") return null
  const req = (eth as { request?: unknown }).request
  if (typeof req !== "function") return null
  return eth as Eip1193Provider
}

async function ensureBaseChain(ethereum: Eip1193Provider): Promise<void> {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    })
  } catch (e: unknown) {
    const code =
      e !== null &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: number }).code === 4902
    if (code) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: "Base",
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      })
      return
    }
    const c =
      e !== null &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: number }).code
    if (c === 4001) {
      throw new DesktopPayError("USER_REJECTED")
    }
    throw e
  }
}

function isUserRejection(e: unknown): boolean {
  if (e instanceof DesktopPayError && e.code === "USER_REJECTED") return true
  if (e === null || typeof e !== "object") return false
  const code = (e as { code?: number }).code
  return code === 4001
}

/**
 * Connect to `window.ethereum`, switch to Base, and send a USDC ERC-20 transfer
 * matching the resource amount and receiver (same semantics as EIP-681).
 */
export async function sendBaseUsdcTransferFromBrowser(
  resource: ApiResource,
): Promise<{ txHash: `0x${string}` }> {
  const ethereum = getEip1193()
  if (!ethereum) {
    throw new DesktopPayError("NO_WALLET")
  }

  const recvRaw = resourceReceiver(resource)
  const tokenRaw = resource.usdcContractAddress?.trim()
  if (!recvRaw || !tokenRaw) {
    throw new DesktopPayError("INVALID_RESOURCE")
  }
  if (resource.network.toLowerCase() !== "base") {
    throw new DesktopPayError("INVALID_RESOURCE")
  }
  if (resource.currency.toUpperCase() !== "USDC") {
    throw new DesktopPayError("INVALID_RESOURCE")
  }

  const minorStr = usdcAmountToUint256String(resource.amount)
  if (minorStr === null) {
    throw new DesktopPayError("INVALID_RESOURCE")
  }

  let token: Address
  let recv: Address
  try {
    token = getAddress(tokenRaw)
    recv = getAddress(recvRaw)
  } catch {
    throw new DesktopPayError("INVALID_RESOURCE")
  }

  const walletClient = createWalletClient({
    chain: base,
    transport: custom(ethereum),
  })

  try {
    await ensureBaseChain(ethereum)
  } catch (e) {
    if (isUserRejection(e)) throw new DesktopPayError("USER_REJECTED")
    throw e instanceof Error ? e : new DesktopPayError("UNKNOWN", String(e))
  }

  let account: Address
  try {
    const accounts = await walletClient.requestAddresses()
    account = accounts[0]!
  } catch (e) {
    if (isUserRejection(e)) throw new DesktopPayError("USER_REJECTED")
    throw new DesktopPayError("UNKNOWN", e instanceof Error ? e.message : undefined)
  }

  if (!account) {
    throw new DesktopPayError("INVALID_RESOURCE")
  }

  const value = BigInt(minorStr)

  try {
    const txHash = await walletClient.writeContract({
      account,
      chain: base,
      address: token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recv, value],
    })
    return { txHash }
  } catch (e) {
    if (isUserRejection(e)) throw new DesktopPayError("USER_REJECTED")
    throw e instanceof Error ? e : new DesktopPayError("UNKNOWN", String(e))
  }
}

export function hasInjectedWalletProvider(): boolean {
  return getEip1193() !== null
}
