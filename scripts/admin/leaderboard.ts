import { getPhotoLeaderboard, getPslLeaderboard, getUserLeaderboard } from '../../lib/leaderboards/service'

const [photos, psl, users] = await Promise.all([
  getPhotoLeaderboard({ page: 1, limit: 10, ageBucket: 'all', gender: 'all', hairColor: 'all', skinColor: 'all', photoType: 'all', sort: 'rating' }),
  getPslLeaderboard({ page: 1, limit: 10, gender: 'all' }),
  getUserLeaderboard({ page: 1, limit: 10 }),
])

console.log(JSON.stringify({ photos, psl, users }, null, 2))
