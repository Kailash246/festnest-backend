// routes/leaderboard.js
import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getLeaderboard } from '../controllers/leaderboardController.js';

const router = Router();
router.get('/', optionalAuth, getLeaderboard);

export default router;
