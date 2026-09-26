// Enable after TikTok approves user.info.profile, then redeploy.
export function creatorTikTokScopes(profileEnabled = process.env.TIKTOK_CREATOR_PROFILE_SCOPE_ENABLED === 'true') {
  return profileEnabled ? 'user.info.basic,user.info.stats,user.info.profile' : 'user.info.basic,user.info.stats'
}

export function creatorTikTokFields(grantedScopes = '') {
  const fields = ['open_id', 'union_id', 'avatar_url', 'avatar_url_100', 'avatar_large_url', 'display_name']
  if (grantedScopes.split(/[ ,]+/).includes('user.info.profile')) fields.push('username', 'profile_deep_link')
  return fields
}
