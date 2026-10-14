import { LegalPage, type LegalSection } from "@/components/app/legal-page";

const deletionEmail =
  "mailto:w@mogging.com?subject=Mogging%20account%20and%20data%20deletion";
const sections: LegalSection[] = [
  {
    id: "request",
    label: "Request deletion",
    title: "Delete your Mogging account and data",
    body: [
      "You can request deletion without reinstalling or opening Mogging. Use the email button above to contact w@mogging.com with the subject “Mogging account and data deletion”.",
      "Send your request from the email address associated with your Mogging account. Include your account name or a relevant report link if you need help locating the account. Do not send passwords or payment card details. We may ask you to verify account ownership before processing the request.",
      "You can also initiate profile deletion inside Mogging: open Settings, choose Delete profile, and confirm the request.",
    ],
  },
  {
    id: "data",
    label: "Data covered",
    title: "What your deletion request covers",
    body: [
      "Your request covers your Mogging account and associated profile information, uploaded face photos, saved reports, landmarks, and share links. We delete or de-identify the copies held in Mogging systems as described in our Privacy Policy at mogging.com/privacy.",
      "Records needed for legal obligations, payment accounting, disputes, security, or fraud prevention may be retained for those purposes. Backup copies follow their normal removal cycle, generally within 90 days. Temporary share-image caches may persist for up to 24 hours.",
      "Third-party analysis providers may retain submitted content or service logs under their own published policies. Our Privacy Policy explains these providers and retention limitations.",
    ],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    title: "Cancel your subscription separately",
    body: [
      "Deleting your Mogging account does not cancel a store subscription. For an Android purchase, open Google Play, select your profile, then Payments & subscriptions, Subscriptions, Mogging, and Cancel subscription. For an iOS purchase, use your Apple account subscription settings.",
      "If you need help with a purchase made on the website, include the checkout email in your deletion request.",
    ],
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalPage
      eyebrow="Account and data"
      title="Delete your account"
      description="Request deletion of your Mogging account and associated data, including when you no longer have the app installed."
      updated="October 13, 2026"
      path="/delete-account"
      contactHref={deletionEmail}
      contactLabel="Request account deletion"
      sections={sections}
    />
  );
}
