// routes/college.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { listColleges, myCollege, setMyCollege } from '../controllers/collegeController.js';
import { validate, validateSetCollege } from '../middleware/validate.js';

const router = Router();
router.get('/list', listColleges);
router.get('/my',   optionalAuth, myCollege);
router.patch('/my', requireAuth,  ...validateSetCollege, validate, setMyCollege);

export default router;
