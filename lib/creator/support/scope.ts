/** A conservative, zero-model-cost admission gate. Ambiguous requests ask for creator context. */
const creatorTerms = /\b(creator|mogging|campaigns?|submissions?|submit|submitted|rereview|re-review|payouts?|bonuses|bonus|referrals?|convert(?:ed|ing|s)?|conversions?|performance|downloads?|analytics|cta|tiktok|instagram|reels?|caption|milestones?|link in bio|content rules|content requirements|video requirements|creator portal|creator studio|my (?:posts?|videos?|account|earnings|balance|revenue|payment|status)|review (?:status|feedback)|approved|rejected|paid|my money|my payment|payment status|audience|views|video examples)\b/i
const unrelated = /\b(weather|recipes?|cook(?:ing)?|homework|president|politics|elections?|stock (?:price|market)|crypto (?:price|trading)|bitcoin price|sports scores?|write (?:me )?(?:a )?(?:poem|essay)|solve (?:this|the) (?:equation|math)|capital of|translate this|debug (?:this|my) code)\b/i
const injection = /\b(ignore|override|disregard)\b.{0,60}\b(instructions?|rules?|prompts?|system)\b|\b(system prompt|developer message|database dump|all users|other (?:users?|creators?)(?:'s|s')? (?:data|submissions|earnings|analytics))\b/i
const followup = /^(?:(?:yes|no|please|go on|tell me more|why|how so|how come|which one|show it|show me|that|it)|(?:what about|show me|use) (?:that|it|them|last week|last month|(?:the )?(?:last )?(?:7|14|30|90) days)|how (?:can|should) i (?:improve|fix) (?:this|that|it))[!.?\s]*$/i
export function supportScope(message: string, hasCreatorContext = false): 'creator' | 'greeting' | 'unrelated' | 'restricted' | 'clarify' {
  if (injection.test(message)) return 'restricted'
  if (unrelated.test(message)) return 'unrelated'
  if (/^(hi|hello|hey|help|thanks|thank you|who are you|what(?:'s| is) your name)[!.?\s]*$/i.test(message)) return 'greeting'
  if (creatorTerms.test(message)) return 'creator'
  if (hasCreatorContext && /^(?:show|give)(?: me)? (?:the )?(?:examples|rules|milestones)(?: (?:for|from) (?:that|this) campaign)?[?.!]*$/i.test(message)) return 'creator'
  if (hasCreatorContext && message.length <= 160 && followup.test(message)) return 'creator'
  return 'clarify'
}
/** Only exact navigation/data intents skip generation. Explanations always go to GLM. */
export function instantIntent(message: string) {
  const text = message.toLowerCase().replace(/[?.!]+$/g, '').trim()
  if (/^(?:(?:show|view|open|read)(?: me)? (?:the )?|what are (?:the )?)?(?:content requirements|video requirements|content rules)$/.test(text)) return text.includes('rules') ? 'rules' as const : 'requirements' as const
  if (/^(?:how are (?:all )?my submissions(?: doing)?|what(?:'s| is) (?:the )?status of my submissions|give me (?:a |an )?submission (?:summary|overview))$/.test(text)) return 'submissions' as const
  if (/^(?:show|list|view|check|open)(?: me)?(?: my| the)? (?:recent |latest )?(?:submissions|submission status)(?: please)?$/.test(text)) return 'submissions' as const
  if (/^(?:show|view|chart|graph|plot)(?: me)?(?: my| the)? (?:analytics|conversions|conversion analytics|revenue)(?: (?:for |over )?(?:the )?(?:last )?(?:7|14|30|90) days)?(?: please)?$/.test(text)) return 'analytics' as const
  if (/^(?:show|list|view)(?: me)?(?: my| the)? (?:campaigns|bonuses|referrals)(?: please)?$/.test(text)) return text.includes('campaigns') ? 'campaigns' as const : text.includes('bonuses') ? 'bonuses' as const : 'referrals' as const
  if (/^(?:help me |how (?:do|can) i )?(?:create|make|build|improve|write)(?: a| my)? cta$|^(?:open|show)(?: me)? (?:the )?cta studio$/.test(text)) return 'cta' as const
  if (/^(?:how (?:do|can) i |i want to |help me )?(?:submit|upload)(?: a| my)? (?:post|video|submission)$/.test(text)) return 'new-submission' as const
  return null
}
export function requestedDays(message: string) {
  if (/last week|past week|this week/i.test(message)) return 7
  return Number(message.match(/\b(7|14|30|90)\s*days?\b/i)?.[1] || 30)
}
