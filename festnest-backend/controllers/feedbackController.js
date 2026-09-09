// controllers/feedbackController.js
import sanitizeHtml from 'sanitize-html';
import { Feedback } from '../models/index.js';
import { created, fail, asyncHandler } from '../utils/response.js';

const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };
const clean = str => (str ? sanitizeHtml(String(str), STRIP_ALL) : str);

export const submitFeedback = asyncHandler(async (req, res) => {
  const { category, message, email, rating, page } = req.body;

  if (!message || message.trim().length < 10)
    return fail(res, 'Please share a bit more detail (at least 10 characters).');

  const feedback = await Feedback.create({
    category,
    message:   clean(message.trim()),
    email:     email ? clean(email.toLowerCase().trim()) : '',
    rating:    rating != null ? Number(rating) : null,
    page:      page ? clean(page) : '',
    userId:    req.user?._id || null,
    userAgent: req.headers['user-agent'] || '',
  });

  return created(res, { id: feedback._id }, 'Thank you for helping us improve FestNest!');
});
