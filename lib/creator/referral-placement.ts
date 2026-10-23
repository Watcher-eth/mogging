import { captionContainsCreatorCode } from './post-guidance';
import { getCreatorPostPreview } from './post-preview';

function matchingLink(value: unknown, ownUrl: string) {
  if (typeof value !== 'string') return false;
  const target = new URL(ownUrl);
  return (value.match(/https?:\/\/[^\s<>"']+/g) ?? []).some(raw => {
    try { const link = new URL(raw); return link.protocol === 'https:' && !link.port && !link.username && !link.password && link.hostname.replace(/^www\./, '') === target.hostname.replace(/^www\./, '') && link.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, ''); }
    catch { return false; }
  });
}

export function profileHasCreatorLink(payload: unknown, platform: 'tiktok' | 'instagram', handle: string, ownUrl: string) {
  const nodes: unknown[] = [payload];
  for (let visited = 0; nodes.length && visited < 20_000; visited++) {
    const node = nodes.pop();
    if (!node || typeof node !== 'object') continue;
    const user = node as Record<string, unknown>;
    const username = platform === 'tiktok' ? user.uniqueId : user.username;
    if (typeof username === 'string' && username.toLowerCase() === handle.toLowerCase()) {
      const bioLink = user.bioLink as { link?: unknown } | undefined;
      if ([user.signature, user.biography, user.external_url, user.bio_description, bioLink?.link].some(value => matchingLink(value, ownUrl))) return true;
    }
    nodes.push(...Object.values(user));
  }
  return false;
}

// Missing or blocked public evidence remains unknown; it cannot earn commission.
export async function referralPlacementEvidence(account: { platform: 'tiktok' | 'instagram'; handle: string | null; oauthProfile: Record<string, unknown> | null }, link: { publicUrl: string; slug: string }, post: { caption: string | null; postUrl: string | null }) {
  let bioLinkVerified = false;
  if (account.handle && /^[a-z0-9._]{1,40}$/i.test(account.handle)) {
    bioLinkVerified = profileHasCreatorLink(account.oauthProfile, account.platform, account.handle, link.publicUrl);
    if (!bioLinkVerified) {
      const endpoint = account.platform === 'tiktok' ? `https://www.tiktok.com/@${account.handle}` : `https://www.instagram.com/${account.handle}/`;
      try {
        const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(3_000) });
        if (response.ok && Number(response.headers.get('content-length') ?? 0) <= 2_097_152) {
          const html = await response.text();
          if (html.length <= 2_097_152) for (const match of html.matchAll(/<script[^>]*(?:type="application\/(?:ld\+)?json"|id="__UNIVERSAL_DATA_FOR_REHYDRATION__")[^>]*>([\s\S]*?)<\/script>/g)) {
            try { if (profileHasCreatorLink(JSON.parse(match[1]), account.platform, account.handle, link.publicUrl)) { bioLinkVerified = true; break; } } catch { /* Non-profile scripts are not evidence. */ }
          }
        }
      } catch { /* Retry through reconciliation, without inventing verification. */ }
    }
  }
  const publicCode = `mogging-${new URL(link.publicUrl).pathname.split('/').at(-1)}`;
  const caption = post.caption ?? (await getCreatorPostPreview(post.postUrl)).caption ?? '';
  return { bioLinkVerified, captionCodeVerified: [publicCode, link.slug].some(code => captionContainsCreatorCode(caption, code)) };
}
