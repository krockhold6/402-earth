import { escapeHtml } from './htmlEscape'
import { qrPngBase64ForUrl } from './creatorReceiptQr'
import type { Env } from '../types/env'
import type { ResourceDefinition } from '../types/resource'

function deliverySummary(resource: ResourceDefinition): string {
  if (resource.deliveryMode === 'protected') {
    return 'Protected link'
  }
  return 'Direct'
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

function networkLabel(network: string): string {
  const n = network.trim().toLowerCase()
  if (n === 'base') return 'Base'
  return network.trim() || network
}

export async function sendCreatorReceiptEmail(
  env: Env,
  input: {
    to: string
    unlockUrl: string
    resource: ResourceDefinition
  },
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('Email is not configured')
  }

  const from =
    env.RESEND_FROM?.trim() ||
    '402 <onboarding@resend.dev>'

  const qrBase64 = await qrPngBase64ForUrl(input.unlockUrl)

  const item = escapeHtml(input.resource.label)
  const price = escapeHtml(
    `${input.resource.amount} ${input.resource.currency}`,
  )
  const network = escapeHtml(networkLabel(input.resource.network))
  const delivery = escapeHtml(deliverySummary(input.resource))
  const created = escapeHtml(formatCreatedAt(input.resource.createdAt))
  const unlockUrlEscaped = escapeHtml(input.unlockUrl)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Your payment link</title>
</head>
<body style="margin:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px 24px 24px;border:1px solid #e8e8ea;">
        <tr><td style="font-size:20px;font-weight:650;line-height:1.25;padding-bottom:8px;">Your payment link is ready</td></tr>
        <tr><td style="font-size:14px;line-height:1.5;color:#5b5b66;padding-bottom:20px;">Save this email as your receipt. Share the link or QR anytime buyers should open your unlock page.</td></tr>
        <tr><td style="padding-bottom:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;">
            <tr><td style="padding:2px 0;"><span style="color:#6f6f78;">Item</span><br/><strong>${item}</strong></td></tr>
            <tr><td style="padding:10px 0 2px;"><span style="color:#6f6f78;">Price</span><br/><strong>${price}</strong></td></tr>
            <tr><td style="padding:10px 0 2px;"><span style="color:#6f6f78;">Network</span><br/><strong>${network}</strong></td></tr>
            <tr><td style="padding:10px 0 2px;"><span style="color:#6f6f78;">Delivery</span><br/><strong>${delivery}</strong></td></tr>
            <tr><td style="padding:10px 0 0;"><span style="color:#6f6f78;">Created</span><br/><strong>${created}</strong></td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-bottom:16px;"><img src="cid:creator-qr" width="280" height="280" alt="QR code for your payment link" style="display:block;border-radius:8px;"/></td></tr>
        <tr><td style="font-size:13px;line-height:1.45;padding-bottom:16px;word-break:break-all;color:#3a3a42;">${unlockUrlEscaped}</td></tr>
        <tr><td align="center" style="padding-bottom:12px;">
          <a href="${unlockUrlEscaped}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;">Open payment page</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.5;color:#8a8a96;padding-top:8px;border-top:1px solid #ececee;">Keep this email as your receipt. You can use this link or QR anytime to share the unlock page.</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: 'Your 402 payment link is ready',
      html,
      attachments: [
        {
          filename: 'payment-qr.png',
          content: qrBase64,
          content_id: 'creator-qr',
        },
      ],
    }),
  })

  if (res.ok) return

  let detail = ''
  try {
    const j = (await res.json()) as { message?: string }
    detail = j.message?.trim() ?? ''
  } catch {
    /* ignore */
  }
  throw new Error(detail || `Resend HTTP ${res.status}`)
}
