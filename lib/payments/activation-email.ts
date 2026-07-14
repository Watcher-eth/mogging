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
  const url = new URL('/', siteUrl)
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
        <td style="padding:0 5px;">
          <div style="width:48px;height:56px;border-radius:8px;background:#ffffff;border:1px solid #111111;text-align:center;font-size:28px;line-height:56px;font-weight:800;color:#000000;font-family:'SF Pro Display',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
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
  <body style="margin:0;background:#ffffff;padding:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Arial,sans-serif;color:#000000;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:collapse;background:#ffffff;">
            <tr>
              <td style="padding:34px 28px 20px;border-bottom:1px solid #111111;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="font-size:14px;line-height:1;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#000000;font-family:'Courier New',Courier,monospace;">
                      Mogging
                    </td>
                    <td align="right" style="font-size:12px;line-height:1;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#777777;font-family:'Courier New',Courier,monospace;">
                      Web purchase
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 28px 22px;">
                <div style="font-size:12px;line-height:1;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#777777;font-family:'Courier New',Courier,monospace;margin-bottom:12px;">
                  Activation code
                </div>
                <h1 style="margin:0;color:#000000;font-size:48px;line-height:0.96;font-weight:850;letter-spacing:0;font-family:'SF Pro Display',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                  Your scan access is ready.
                </h1>
                <p style="margin:18px 0 0;max-width:480px;color:#676767;font-size:21px;line-height:1.34;font-weight:700;">
                  Unlock ${escapeHtml(productName)} in the app with the code below.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <div style="border-top:1px solid #111111;border-bottom:1px solid #111111;padding:24px 0;text-align:center;">
                  <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="border-collapse:collapse;margin:0 auto;">
                    <tr>${digits}</tr>
                  </table>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-bottom:1px solid #d9d9d9;">
                  <tr>
                    <td style="padding:17px 0;border-top:1px solid #d9d9d9;font-size:12px;line-height:1;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#777777;font-family:'Courier New',Courier,monospace;">
                      Product
                    </td>
                    <td align="right" style="padding:17px 0;border-top:1px solid #d9d9d9;font-size:17px;line-height:1.2;font-weight:800;color:#000000;">
                      ${escapeHtml(productName)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:17px 0;border-top:1px solid #d9d9d9;font-size:12px;line-height:1;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#777777;font-family:'Courier New',Courier,monospace;">
                      Restore
                    </td>
                    <td align="right" style="padding:17px 0;border-top:1px solid #d9d9d9;font-size:17px;line-height:1.25;font-weight:800;color:#000000;">
                      Tap Use Code in the app
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <a href="${escapeHtml(appUrl)}" style="display:block;background:#000000;color:#ffffff;text-decoration:none;border-radius:0;padding:18px 22px;text-align:center;font-size:16px;font-weight:850;letter-spacing:0.06em;text-transform:uppercase;">
                  Open Mogging
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 38px;">
                <p style="margin:0;color:#777777;font-size:13px;line-height:1.55;font-weight:600;">
                  Keep this email as a backup. The code is linked to your Stripe purchase and can activate your web purchase inside Mogging on a new device.
                </p>
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
