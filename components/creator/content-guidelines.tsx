import Link from 'next/link'

export const accountReviewPolicy = 'Complete any account review requested by the moderation team. Payouts are held until requested evidence is provided and the review is resolved. Confirmed botting on even one video puts all earnings at risk.'

export const discordContactUrl = process.env.NEXT_PUBLIC_CREATOR_DISCORD_CONTACT_URL || 'https://discord.com/users/1526677788638056569'

export function AnalyticsVerificationHelp() {
  return <p className="mt-3 text-xs leading-5">Don’t have two devices? <a href={discordContactUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Message us on Discord</a> and we’ll arrange a video call to verify your analytics live.</p>
}

export function ContentGuidelines() {
  return (
    <section id="video-requirements" className="scroll-mt-6" aria-labelledby="content-standard-title">
      <h2 id="content-standard-title" className="text-lg font-semibold tracking-tight">Before you publish</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#73777d]">Every video must clearly emphasize the improvement, attractiveness, features, transformation, or potential of someone’s looks. This applies to the footage, on-screen text, and caption. Looksmaxxing, BP (blackpill), or transformation labels alone do not qualify a post. If a moderator has to question whether it is about looks, it is rejected.</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#73777d]">Mogging pays for access to an audience interested in their appearance. Your framing determines who watches: a celebrity montage can attract fans, a song meme can attract music listeners, and a feature breakdown can attract people who want to understand their own face. High views alone do not make a video eligible.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl creator-notice p-4"><h4 className="text-sm font-semibold">What we want</h4><p className="mt-2 text-sm leading-6 text-zinc-600">Clear feature analysis, genuine before-and-after transformations, explicit attractiveness comparisons, or looks-potential edits. Show Mogging clearly and end by inviting viewers to try it.</p></div>
        <div className="rounded-2xl creator-warning p-4"><h4 className="text-sm font-semibold text-red-800">What we reject</h4><p className="mt-2 text-sm leading-6 text-red-800">Engagement bait, unrelated captions, excluded niches, and fan edits whose looks connection exists only in your intent. Adding a Mogging CTA at the end does not rescue unrelated content.</p></div>
      </div>
      <div className="mt-4 grid gap-2">
        <RuleDetail title="Celebrity edits and the Smallville exception">
          <p>Tom Welling, Marlon, Damon, and other attractive celebrities are not automatically eligible. Emphasize their appearance with a specific looks-focused premise. A compilation about fame, a character, a scene, or the show attracts the wrong audience.</p>
          <p>Smallville clips that highlight the show are excluded. Solo Tom Welling edits from the show can qualify when his attractiveness is clearly the subject. These edits can perform very well when framed correctly; do not mistake permission to use a subject for approval of every edit of that subject.</p>
        </RuleDetail>
        <RuleDetail title="Engagement farms: exact examples to avoid" prohibited>
          <p>Do not make appearance or confidence depend on interacting with a post. Looks-related vocabulary does not make an engagement farm acceptable.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>“May your hair and jawline treat you the way you treat this video”</li>
            <li>“Your summer glow up will treat you the same way you treat this video”</li>
            <li>“Each time you interact with this video your confidence goes up”</li>
            <li>“You unlock insane confidence just because you gave me 3 notifications and used sound”</li>
          </ul>
          <p>A relevant invitation to try Mogging is the required product CTA. Promising a glow-up for likes, “claim” comments, shares, or sound use is engagement bait.</p>
        </RuleDetail>
        <RuleDetail title="Unrelated captions and excluded niches" prohibited>
          <p>Rejected caption examples: “When you hear this song”; “mfs after rejecting a girl for the first time”; “mood because summer is in 4 months”; “how summer feels with that one bro”. An attractive face behind this text does not change the subject.</p>
          <p>Currently excluded: anime, cartoons and animated content, MMA, NBA and sports generally, animal edits, and Smallville story clips. These are current restrictions, not promises that a niche will become eligible later.</p>
        </RuleDetail>
        <RuleDetail title="Read the comments to understand your audience">
          <p>The strongest signal in the reference material is viewers discussing their own looks: asking about potential, ratings / PSL, or specific facial features, sometimes sharing their own photos. PSL here is appearance-rating terminology; the app creators should promote is Mogging.</p>
          <p>Song requests, plot discussions, school jokes, tagging friends, and repetitive “claim” comments suggest a different audience. Use this feedback to improve the next edit. Comments are a diagnostic signal, not a required quota or a guarantee of approval; the video still has to meet every rule. Never fabricate the desired comments.</p>
        </RuleDetail>
        <RuleDetail title="Account reviews, fraud, and payout holds"><p>{accountReviewPolicy}</p><p>Keep evidence genuine and readable. For each video submission, film the post’s analytics with a second device in one continuous take. Show the screen, username, post, views, traffic sources, and audience locations. Screenshots, native screen recordings, cuts, and edits are not accepted. Follow the account-verification recording requirements and provide additional evidence when requested. Content eligibility, account approval, audience geography, view milestones, and payout setup are separate checks; passing one does not waive the others.</p><AnalyticsVerificationHelp /></RuleDetail>
      </div>
      <Link href="/creator/guide?topic=examples" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#00A8EF] underline underline-offset-4">Explore screenshots, explanations, and June video references →</Link>
    </section>
  )
}

function RuleDetail({ title, children, prohibited = false }: { title: string; children: React.ReactNode; prohibited?: boolean }) {
  return <details className={prohibited ? "rounded-2xl creator-warning text-red-800" : "rounded-2xl border border-black/[0.07] bg-white"}><summary className="cursor-pointer px-4 py-4 text-sm font-semibold">{title}</summary><div className="space-y-3 border-t border-black/[0.055] p-4 text-sm leading-6 text-[#73777d]">{children}</div></details>
}

export function ContentRequirementsNote() {
  return <aside className="creator-notice mb-5 rounded-2xl p-4 text-sm leading-6"><strong>Make the whole video about looks.</strong><span className="text-zinc-600"> Footage, text, and captions must explicitly focus on appearance, features, potential, or transformation. No engagement farms or unrelated fan edits. </span><Link href="/creator/guide#video-requirements" className="font-semibold text-[#00A8EF] underline underline-offset-4">Read the rules</Link><span className="text-zinc-600"> · </span><Link href="/creator/guide?topic=examples" className="font-semibold text-[#00A8EF] underline underline-offset-4">See examples</Link></aside>
}

export function AccountReviewNote() {
  return <details className="creator-notice mb-5 rounded-2xl p-4"><summary className="cursor-pointer text-sm font-semibold">Account reviews and payout eligibility</summary><p className="mt-3 text-sm leading-6 text-[#73777d]">{accountReviewPolicy}</p><Link href="/creator/guide?topic=payout" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#00A8EF] underline underline-offset-4">Read the payout and audience requirements</Link></details>
}
