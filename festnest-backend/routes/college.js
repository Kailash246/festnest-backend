// routes/college.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { listColleges, myCollege, setMyCollege } from '../controllers/collegeController.js';

const router = Router();
router.get('/list', listColleges);
router.get('/my',   optionalAuth, myCollege);
router.patch('/my', requireAuth,  setMyCollege);

export default router;
