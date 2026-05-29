import { LegalPage, type LegalSection } from '@/components/app/legal-page'

const sections: LegalSection[] = [
  {
    id: 'contact',
    label: 'Contact Support',
    title: 'Contact Support',
    body: [
      'Email support@mogging.app for account, billing, analysis, photo, privacy, or safety help. Include the email on your account and a short description of what happened.',
      { items: ['For billing issues, include the checkout email and approximate purchase time.', 'For analysis issues, include the analysis or share link if you have one.', 'For safety or privacy requests, include links or screenshots that identify the content.'] },
    ],
  },
  {
    id: 'account',
    label: 'Accounts',
    title: 'Account Help',
    body: [
      'If you cannot sign in, first confirm you are using the same login method you used to create the account. If your profile details are wrong, use the account menu to update your name and social link.',
      'If you believe someone accessed your account without permission, contact support and stop using any shared or compromised credentials.',
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    title: 'Analysis and Photo Issues',
    body: [
      'Analysis quality depends on photo clarity, lighting, face visibility, camera angle, and whether the uploaded image can be processed by the model.',
      { items: ['Use a clear front-facing image with even lighting.', 'Avoid heavy filters, extreme angles, face coverings, or low-resolution screenshots.', 'Try a new upload if the report is incomplete or does not match the intended photo.'] },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    title: 'Billing and Refunds',
    body: [
      'Payments may be handled through a third-party checkout provider. If a payment succeeds but a feature does not unlock, contact support with the checkout email and receipt details.',
      'Refund requests are reviewed case by case unless another refund right applies by law or was stated during checkout.',
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy Requests',
    title: 'Privacy and Data Requests',
    body: [
      'You can request help with account data, photo visibility, share links, deletion, or privacy questions by emailing support@mogging.app.',
      'For faster handling, use the subject Privacy Request and include the account email, profile name, and any relevant links.',
    ],
  },
  {
    id: 'safety',
    label: 'Safety',
    title: 'Safety and Abuse Reports',
    body: [
      'Mogging should not be used to harass, threaten, impersonate, or target people. Report abusive profiles, uploads, or shared links to support.',
      'Include the link, username, screenshot, and a brief explanation so the report can be reviewed.',
    ],
  },
]

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Support"
      description="Help for accounts, analysis reports, photos, billing, privacy requests, and safety reports on Mogging."
      updated="May 28, 2026"
      path="/support"
      sections={sections}
    />
  )
}
