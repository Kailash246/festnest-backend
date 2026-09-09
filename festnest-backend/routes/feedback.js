// routes/feedback.js
import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { validate, validateSubmitFeedback } from '../middleware/validate.js';
import { submitFeedback } from '../controllers/feedbackController.js';

const router = Router();

router.post('/', optionalAuth, ...validateSubmitFeedback, validate, submitFeedback);

export default router;
