// Enable after TikTok approves user.info.profile, then redeploy.
export function creatorTikTokScopes(profileEnabled = process.env.TIKTOK_CREATOR_PROFILE_SCOPE_ENABLED === 'true') {
  return profileEnabled ? 'user.info.basic,user.info.stats,user.info.profile' : 'user.info.basic,user.info.stats'
}

export function creatorTikTokFields(grantedScopes = '') {
  const fields = ['open_id', 'union_id', 'avatar_url', 'avatar_url_100', 'avatar_large_url', 'display_name']
  const scopes = grantedScopes.split(/[ ,]+/)
  if (scopes.includes('user.info.profile')) fields.push('username', 'profile_deep_link', 'bio_description', 'is_verified')
  if (scopes.includes('user.info.stats')) fields.push('follower_count', 'following_count', 'likes_count', 'video_count')
  return fields
}
