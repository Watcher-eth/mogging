export const CREATOR_CTA_GUIDANCE = 'Use a 2–3 second CTA inviting viewers to try Mogging. Place it within the first 10 seconds of a video or the first 5 slides of a slideshow.'
export const CREATOR_SUBMIT_GUIDANCE = 'Submit as soon as your post reaches the first milestone: 20,000 views. You do not need to wait for a higher milestone.'
export const CREATOR_REREVIEW_GUIDANCE = 'Yes—you can earn more when the same post reaches another milestone. Open your submission, click Request rereview, update the views, and upload fresh analytics. After approval, we pay the new milestone total minus any amount already paid for that post, subject to campaign rules and remaining budget.'

export function creatorFormatElement(element: { title: string; detail: string }) {
  return element.title === 'Closing CTA'
    ? { title: 'Early CTA · 2–3 seconds', detail: CREATOR_CTA_GUIDANCE }
    : element
}
