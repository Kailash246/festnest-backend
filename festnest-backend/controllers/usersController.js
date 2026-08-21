// controllers/usersController.js
import sanitizeHtml from 'sanitize-html';
import User     from '../models/User.js';
import { SavedEvent, Registration, PointsLog, HostedEvent } from '../models/index.js';
import { cloudinary, uploadUserAvatar } from '../config/cloudinary.js';
import { ok, fail, notFoundRes, asyncHandler } from '../utils/response.js';

const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };
const clean = str => (str ? sanitizeHtml(String(str), STRIP_ALL) : str);

export const getMe = asyncHandler(async (req, res) => {
  const [savedCount, regCount] = await Promise.all([
    SavedEvent.countDocuments({ user: req.user._id }),
    Registration.countDocuments({ user: req.user._id }),
  ]);
  return ok(res, { user: req.user.toPublic(), stats: { saved: savedCount, registered: regCount } });
});

export const updateMe = asyncHandler(async (req, res) => {
  const {
    name, college, city, year, branch, phone, interests, notificationPrefs,
    bio, organization, designation, website, linkedin, instagram, github,
  } = req.body;
  const updates = {};
  if (name              !== undefined) updates.name         = clean(name);
  if (college           !== undefined) updates.college      = clean(college);
  if (city              !== undefined) updates.city         = clean(city);
  if (year              !== undefined) updates.year         = year;
  if (branch            !== undefined) updates.branch       = clean(branch);
  if (phone             !== undefined) updates.phone        = phone;
  if (bio               !== undefined) updates.bio          = clean(bio);
  if (organization      !== undefined) updates.organization = clean(organization);
  if (designation       !== undefined) updates.designation  = clean(designation);
  if (website           !== undefined) updates.website      = website;
  if (linkedin          !== undefined) updates.linkedin     = linkedin;
  if (instagram         !== undefined) updates.instagram    = instagram;
  if (github            !== undefined) updates.github       = github;
  if (interests)                       updates.interests    = interests;
  if (notificationPrefs)               updates.notificationPrefs = notificationPrefs;

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  return ok(res, { user: user.toPublic() }, 'Profile updated');
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No image uploaded');

  // Delete old Cloudinary image if exists
  if (req.user.avatar?.publicId) {
    await cloudinary.uploader.destroy(req.user.avatar.publicId).catch(() => {});
  }

  const result = await uploadUserAvatar(req.file.buffer);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { 'avatar.url': result.secure_url, 'avatar.publicId': result.public_id },
    { new: true }
  );
  return ok(res, { avatar: user.avatar }, 'Avatar updated');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return fail(res, 'currentPassword and newPassword required');
  if (newPassword.length < 8) return fail(res, 'Password must be at least 8 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword)))
    return fail(res, 'Current password is incorrect', 400);

  user.password = newPassword;
  await user.save();
  return ok(res, {}, 'Password changed successfully');
});

export const myRegistrations = asyncHandler(async (req, res) => {
  const regs = await Registration.find({ user: req.user._id })
    .populate('event').sort({ createdAt: -1 }).lean();
  return ok(res, { registrations: regs });
});

export const myPoints = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('points');
  const log  = await PointsLog.find({ user: req.user._id })
    .populate('event', 'name slug').sort({ createdAt: -1 }).limit(20).lean();
  return ok(res, { totalPoints: user.points, log });
});

export const myHostedEvents = asyncHandler(async (req, res) => {
  const hosted = await HostedEvent.find({ submittedBy: req.user._id })
    .populate('linkedEvent', 'name slug _id isActive')
    .sort({ createdAt: -1 }).lean();
  return ok(res, { hostedEvents: hosted });
});
