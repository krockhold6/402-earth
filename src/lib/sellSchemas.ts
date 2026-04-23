import { z } from "zod"

const wallet = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Payout wallet must be a valid Base address")

const usdcAmount = z
  .string()
  .trim()
  .min(1, "Price is required")
  .regex(/^\d+(\.\d{1,6})?$/, "Invalid USDC amount")

const httpsEndpoint = z
  .string()
  .trim()
  .url()
  .refine((s) => s.startsWith("https:"), "Endpoint must use https")

/** Client-side validation for Resource sell flow (mirrors Worker rules). */
export const homeResourceCreateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(200),
  amount: usdcAmount,
  receiverAddress: wallet,
  destinationUrl: z.string().trim().optional(),
  deliveryMode: z.enum(["direct", "protected"]),
  protectedTtlSeconds: z
    .number()
    .int()
    .refine((n) => n === 0 || (n >= 60 && n <= 604800))
    .optional(),
  protectedOneTime: z.boolean().optional(),
})

/** Client-side validation for Capability sell flow. */
export const homeCapabilityCreateSchema = z.object({
  capabilityName: z.string().trim().min(1, "Capability name is required"),
  amount: usdcAmount,
  receiverAddress: wallet,
  endpoint: httpsEndpoint,
  httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  inputFormat: z.string().trim().min(1, "Input format is required"),
  resultFormat: z.string().trim().min(1, "Result format is required"),
  deliveryMode: z.enum(["direct", "protected", "async"]),
  receiptMode: z.enum(["standard", "detailed"]),
})
