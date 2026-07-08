import Stripe from 'stripe'
import { env } from '@/lib/env'
import { getProductConfig, paymentProductSchemaValues } from '@/lib/payments/entitlements'
import type { PaymentProduct } from '@/lib/db/schema'

type SendActivationEmailInput = {
  session: Stripe.Checkout.Session
}

export async function sendPaymentActivationEmailForCheckoutSession({ session }: SendActivationEmailInput) {
  const to = readCheckoutEmail(session)
  const activationCode = readActivationCode(session.metadata?.activationCode)
  const product = readPaymentProduct(session.metadata?.product)

  if (!to || !activationCode || !product) return
  if (!env.RESEND_API_KEY) {
    console.warn('Skipping payment activation email because RESEND_API_KEY is not configured', session.id)
    return
  }

  const productConfig = getProductConfig(product)
  const appUrl = buildAppUrl(session, product)
  const subject = `Your Mogging activation code: ${activationCode}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mogging-activation-${session.id}`,
    },
    body: JSON.stringify({
      from: env.PAYMENTS_EMAIL_FROM,
      to: [to],
      ...(env.PAYMENTS_EMAIL_REPLY_TO ? { reply_to: env.PAYMENTS_EMAIL_REPLY_TO } : null),
      subject,
      html: renderActivationEmailHtml({
        activationCode,
        appUrl,
        productName: productConfig.name,
      }),
      text: renderActivationEmailText({
        activationCode,
        appUrl,
        productName: productConfig.name,
      }),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Resend activation email failed (${response.status}): ${body}`)
  }
}

function readCheckoutEmail(session: Stripe.Checkout.Session) {
  if (session.customer_details?.email) return session.customer_details.email
  if (session.customer_email) return session.customer_email

  const customer = session.customer
  if (customer && typeof customer === 'object' && !customer.deleted && customer.email) {
    return customer.email
  }

  return null
}

function readActivationCode(value: unknown) {
  return typeof value === 'string' && /^\d{6}$/.test(value) ? value : null
}

function readPaymentProduct(value: unknown): PaymentProduct | null {
  if (typeof value === 'string' && paymentProductSchemaValues.includes(value as PaymentProduct)) {
    return value as PaymentProduct
  }

  return null
}

function buildAppUrl(session: Stripe.Checkout.Session, product: PaymentProduct) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || env.NEXTAUTH_URL || 'https://mogging.com'
  const url = new URL('/app', siteUrl)
  url.searchParams.set('checkout', 'success')
  url.searchParams.set('product', product)
  url.searchParams.set('source', session.metadata?.source || 'web2app')
  url.searchParams.set('session_id', session.id)

  const installId = session.metadata?.mobileInstallId
  if (installId) url.searchParams.set('install_id', installId)

  return url.toString()
}

function renderActivationEmailText({
  activationCode,
  appUrl,
  productName,
}: {
  activationCode: string
  appUrl: string
  productName: string
}) {
  return [
    'Your Mogging purchase is ready.',
    '',
    `Plan: ${productName}`,
    `Activation code: ${activationCode}`,
    '',
    'Open Mogging, tap Use Code, and enter this code to activate your web purchase on this device.',
    '',
    `Open setup page: ${appUrl}`,
  ].join('\n')
}

function renderActivationEmailHtml({
  activationCode,
  appUrl,
  productName,
}: {
  activationCode: string
  appUrl: string
  productName: string
}) {
  const digits = activationCode
    .split('')
    .map(
      (digit) => `
        <td style="padding:0 4px;">
          <div style="width:46px;height:54px;border-radius:16px;background:#f4f7fb;border:1px solid #dfe7f2;text-align:center;font-size:28px;line-height:54px;font-weight:800;color:#080b12;font-family:Inter,Arial,sans-serif;">
            ${escapeHtml(digit)}
          </div>
        </td>`
    )
    .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your Mogging activation code</title>
  </head>
  <body style="margin:0;background:#05070b;padding:32px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 18px;text-align:center;">
                <div style="display:inline-block;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:8px 14px;color:#cbd5e1;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                  Mogging
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#10131a;border:1px solid #252a36;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.42);">
                <div style="padding:34px 30px 12px;text-align:center;background:linear-gradient(180deg,#151a24 0%,#10131a 76%);">
                  <h1 style="margin:0;color:#ffffff;font-size:34px;line-height:1.06;font-weight:850;letter-spacing:0;">
                    Your scan access is ready
                  </h1>
                  <p style="margin:16px auto 0;max-width:420px;color:#aeb7c7;font-size:17px;line-height:1.45;font-weight:600;">
                    Use this activation code to unlock ${escapeHtml(productName)} in the app.
                  </p>
                </div>
                <div style="padding:24px 30px 4px;text-align:center;">
                  <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="border-collapse:collapse;margin:0 auto 22px;">
                    <tr>${digits}</tr>
                  </table>
                  <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1688ff;color:#ffffff;text-decoration:none;border-radius:999px;padding:16px 26px;font-size:16px;font-weight:800;letter-spacing:0.02em;">
                    Open Mogging
                  </a>
                </div>
                <div style="padding:22px 30px 34px;">
                  <div style="background:#0b0e14;border:1px solid #242a36;border-radius:20px;padding:18px 18px;color:#c5ccd8;font-size:15px;line-height:1.55;">
                    <strong style="color:#ffffff;">Backup restore:</strong> open the app, tap <strong style="color:#ffffff;">Use Code</strong>, then enter the six digits above. Keep this email in case you install Mogging on another device.
                  </div>
                  <p style="margin:18px 0 0;color:#747d8d;font-size:12px;line-height:1.5;text-align:center;">
                    This code is linked to your Stripe purchase. If you did not make this purchase, you can ignore this email.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
