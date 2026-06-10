// controllers/collegeController.js
import { College } from '../models/index.js';
import Event  from '../models/Event.js';
import User   from '../models/User.js';
import { ok, fail, asyncHandler } from '../utils/response.js';

export const listColleges = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = q ? { $text: { $search: q } } : {};
  const colleges = await College.find(filter).sort({ name: 1 }).limit(30).lean();
  return ok(res, { colleges });
});

export const myCollege = asyncHandler(async (req, res) => {
  const collegeName = req.query.college || req.user?.college;
  if (!collegeName) return fail(res, 'college param or auth required', 400);
  const [college, events, studentCount] = await Promise.all([
    College.findOne({ name: collegeName }).lean(),
    Event.find({ college: collegeName, isActive: true }).sort({ createdAt: -1 }).lean(),
    User.countDocuments({ college: collegeName }),
  ]);
  return ok(res, { college: college || { name: collegeName }, events, studentCount });
});

export const setMyCollege = asyncHandler(async (req, res) => {
  const { college } = req.body;
  if (!college) return fail(res, 'college is required');
  await User.findByIdAndUpdate(req.user._id, { college });
  return ok(res, { college }, 'College updated');
});
