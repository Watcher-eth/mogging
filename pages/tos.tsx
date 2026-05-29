import { LegalPage, type LegalSection } from '@/components/app/legal-page'

const sections: LegalSection[] = [
  {
    id: 'acceptance',
    label: 'Acceptance of Terms',
    title: 'Acceptance of Terms',
    body: [
      'By accessing or using Mogging, you agree to these Terms of Service. If you do not agree, do not use the product.',
      'Mogging provides entertainment, ranking, and appearance-analysis features. The service is not medical, psychological, employment, financial, or professional advice.',
    ],
  },
  {
    id: 'eligibility',
    label: 'Eligibility',
    title: 'Eligibility and Accounts',
    body: [
      'You must be old enough to use online services in your jurisdiction and able to enter into these Terms. You are responsible for keeping your sign-in credentials and account activity secure.',
      { items: ['Provide accurate account information.', 'Do not impersonate another person.', 'Tell us promptly if you believe your account has been compromised.'] },
    ],
  },
  {
    id: 'use',
    label: 'Use of the Service',
    title: 'Use of the Service',
    body: [
      'You may use Mogging only for lawful purposes and in a way that does not interfere with the service or other users.',
      { items: ['Do not upload content you do not have permission to use.', 'Do not harass, threaten, shame, or target people.', 'Do not scrape, reverse engineer, overload, or abuse the service.', 'Do not use the service to make high-stakes decisions about a person.'] },
    ],
  },
  {
    id: 'content',
    label: 'User Content',
    title: 'Photos and User Content',
    body: [
      'You retain ownership of content you submit. You grant Mogging a limited license to host, process, analyze, display, and share that content as needed to operate the features you use.',
      'You are responsible for the photos and profile details you upload, including having appropriate rights and consent where required.',
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    title: 'Payments and Refunds',
    body: [
      'Some features may require payment. Prices, taxes, and checkout terms are shown before purchase. Payments may be processed by third-party providers such as Stripe.',
      'Refunds are handled case by case unless a different refund right is required by law or stated during checkout.',
    ],
  },
  {
    id: 'availability',
    label: 'Availability',
    title: 'Changes and Availability',
    body: [
      'We may update, pause, remove, or change parts of Mogging at any time. We may also update these Terms by posting a revised version on this page.',
      'Your continued use after changes become effective means you accept the updated Terms.',
    ],
  },
  {
    id: 'disclaimers',
    label: 'Disclaimers',
    title: 'Disclaimers and Limits',
    body: [
      'Mogging is provided as is and as available. Analysis, rankings, scores, and generated text can be incomplete, inaccurate, subjective, or unavailable.',
      'To the fullest extent permitted by law, Mogging is not liable for indirect, incidental, special, consequential, or punitive damages, or loss of data, profits, goodwill, or reputation.',
    ],
  },
  {
    id: 'contact',
    label: 'Contact',
    title: 'Contact Us',
    body: [
      'Questions about these Terms can be sent to support@mogging.app. Include enough detail for us to understand your request and the account or feature involved.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms and Conditions"
      description="The rules for using Mogging, including accounts, uploads, rankings, payments, acceptable use, and service limits."
      updated="May 28, 2026"
      path="/tos"
      sections={sections}
    />
  )
}
