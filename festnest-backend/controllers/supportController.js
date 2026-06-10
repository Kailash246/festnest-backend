// controllers/supportController.js
import { SupportTicket } from '../models/index.js';
import { ok, fail, created, asyncHandler } from '../utils/response.js';

const FAQS = [
  { id: 'f1', category: 'registration', q: 'How do I register for an event?', a: "Tap any event card to open its detail page, then tap 'Register Now'. You need a FestNest account." },
  { id: 'f2', category: 'registration', q: 'Can I register for multiple events?', a: 'Yes! No limit. Browse, save, then register from your Saved tab.' },
  { id: 'f3', category: 'organiser',    q: 'How do I list my college event on FestNest?', a: 'Go to Host Event, fill the form and submit. Review takes 48 hours. You earn 300 points when approved.' },
  { id: 'f4', category: 'organiser',    q: 'Is there a fee for listing?', a: 'Listing is completely free for verified college clubs and cells.' },
  { id: 'f5', category: 'account',      q: 'How do FestNest points work?', a: 'Register (+50), attend (+150), win (+500), refer (+75), host (+300).' },
  { id: 'f6', category: 'account',      q: 'I forgot my password. What do I do?', a: "Tap 'Forgot password' on login. Enter your email, get a 6-digit OTP, set a new password." },
  { id: 'f7', category: 'technical',    q: 'Why am I not receiving notifications?', a: 'Check Profile > Notification Preferences and your device notification settings.' },
  { id: 'f8', category: 'technical',    q: 'The app is slow or not loading events.', a: 'Try pull-to-refresh. If it persists, clear app cache or contact support.' },
];

export const getFaqs = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const faqs = category && category !== 'all' ? FAQS.filter(f => f.category === category) : FAQS;
  return ok(res, { faqs });
});

export const submitTicket = asyncHandler(async (req, res) => {
  const { name, email, issueType, subject, message } = req.body;
  if (!name || !email || !issueType || !subject || !message)
    return fail(res, 'name, email, issueType, subject and message are required');
  if (message.length < 10) return fail(res, 'Message must be at least 10 characters');
  const ticket = await SupportTicket.create({ user: req.user?._id || null, name, email, issueType, subject, message });
  return created(res, { ticket }, 'Message received. We will get back to you within 24 hours.');
});

export const myTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  return ok(res, { tickets });
});

export const reopenTicket = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const updateOp = { $set: { status: 'open' } };
  if (message?.trim()) {
    updateOp.$push = {
      replies: { author: 'user', authorId: req.user._id, name: req.user.name, message: message.trim() },
    };
  }
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: 'resolved' },
    updateOp,
    { new: true }
  );
  if (!ticket) return notFoundRes(res, 'Ticket not found or cannot be reopened');
  return ok(res, { ticket }, 'Ticket reopened');
});

export const addReply = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return fail(res, 'Message is required');
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $push: { replies: { author: 'user', authorId: req.user._id, name: req.user.name, message: message.trim() } } },
    { new: true }
  );
  if (!ticket) return notFoundRes(res, 'Ticket not found');
  return ok(res, { ticket }, 'Reply added');
});

