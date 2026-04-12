/** Row in `resource_definitions` — catalog entry for a payable resource. */
export interface ResourceDefinition {
  slug: string
  label: string
  amount: string
  currency: string
  network: string
  /** Lowercase `0x` + 40 hex — USDC payee on Base for Lane 1. */
  receiverAddress: string
  active: boolean
  unlockType: string
  contentType: string | null
  successRedirectPath: string | null
  createdAt: string
  updatedAt: string
}
