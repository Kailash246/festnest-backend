// controllers/leaderboardController.js
import User       from '../models/User.js';
import { PointsLog } from '../models/index.js';
import { ok, asyncHandler } from '../utils/response.js';

const POINTS_RULES = [
  { action: 'Register for an event', icon: '🗓️', points: '+50 pts'  },
  { action: 'Attend & check in',     icon: '✅', points: '+150 pts' },
  { action: 'Win a competition',     icon: '🏆', points: '+500 pts' },
  { action: 'Refer a friend',        icon: '📣', points: '+75 pts'  },
  { action: 'Host an event',         icon: '✍️', points: '+300 pts' },
];

function badges(rank, pts) {
  const b = [];
  if (rank === 1)  b.push('👑');
  if (pts >= 2000) b.push('🏆');
  if (pts >= 1000) b.push('🔥');
  if (rank <= 3)   b.push('🏅');
  if (pts >= 500)  b.push('⭐');
  return b;
}

export const getLeaderboard = asyncHandler(async (req, res) => {
  const { period = 'all' } = req.query;
  let leaderboard;

  if (period === 'all') {
    const users = await User.find({}).select('name college avatar points')
      .sort({ points: -1 }).limit(50).lean();
    leaderboard = users.map((u, i) => ({
      rank: i + 1, id: u._id, name: u.name, college: u.college,
      initials:  u.avatar?.initials  || u.name.slice(0, 2).toUpperCase(),
      avatarUrl: u.avatar?.url || '',
      pts: u.points,
      badges: badges(i + 1, u.points),
    }));
  } else {
    const since = period === 'month'
      ? new Date(Date.now() - 30  * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const agg = await PointsLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$user', pts: { $sum: '$points' } } },
      { $sort:  { pts: -1 } },
      { $limit: 50 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
    ]);

    leaderboard = agg.map((r, i) => ({
      rank: i + 1, id: r.user._id, name: r.user.name, college: r.user.college,
      initials:  r.user.avatar?.initials || r.user.name.slice(0, 2).toUpperCase(),
      avatarUrl: r.user.avatar?.url || '',
      pts: r.pts,
      badges: badges(i + 1, r.pts),
    }));
  }

  const podium = leaderboard.length >= 3
    ? [leaderboard[1], leaderboard[0], leaderboard[2]]
    : leaderboard.slice(0, 3);

  const myRank = req.user
    ? leaderboard.find(r => String(r.id) === String(req.user._id)) || null
    : null;

  return ok(res, { leaderboard, podium, myRank, rules: POINTS_RULES, period });
});
