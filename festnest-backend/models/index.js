// models/SavedEvent.js
import mongoose from 'mongoose';
const savedEventSchema = new mongoose.Schema(
  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  },
  { timestamps: true }
);
savedEventSchema.index({ user: 1, event: 1 }, { unique: true });
export const SavedEvent = mongoose.model('SavedEvent', savedEventSchema);

// ─────────────────────────────────────────────────

// models/Registration.js
const registrationSchema = new mongoose.Schema(
  {
    user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    event:  { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    status: { type: String, enum: ['confirmed', 'pending', 'cancelled'], default: 'confirmed' },
  },
  { timestamps: true }
);
registrationSchema.index({ user: 1, event: 1 }, { unique: true });
export const Registration = mongoose.model('Registration', registrationSchema);

// ─────────────────────────────────────────────────

// models/Notification.js
const notificationSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type:    { type: String, enum: ['deadlines', 'updates', 'system'], required: true },
    icon:    { type: String, default: '🔔' },
    bg:      { type: String, default: 'bg-[#EEF2FF]' },
    title:   { type: String, required: true },
    sub:     { type: String, default: '' },
    cta:     { type: String, default: null },
    ctaId:   { type: String, default: null },
    isRead:  { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, isRead: 1 });
export const Notification = mongoose.model('Notification', notificationSchema);

// ─────────────────────────────────────────────────

// models/PointsLog.js
const pointsLogSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action:      { type: String, enum: ['register', 'attend', 'win', 'refer', 'host'], required: true },
    points:      { type: Number, required: true },
    event:       { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);
pointsLogSchema.index({ user: 1 });
export const PointsLog = mongoose.model('PointsLog', pointsLogSchema);

// ─────────────────────────────────────────────────

// models/HostedEvent.js
const hostedEventSchema = new mongoose.Schema(
  {
    submittedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    linkedEvent:     { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    eventName:       { type: String, required: true },
    college:         { type: String, required: true },
    eventType:       { type: String, required: true },
    startDate:       { type: String, required: true },
    city:            { type: String, required: true },
    venue:           { type: String, default: '' },
    teamSize:        { type: String, default: '' },
    hasPrize:        { type: Boolean, default: false },
    prizeDetails:    { type: String, default: '' },
    isPaid:          { type: Boolean, default: false },
    entryFee:        { type: String, default: '' },
    about:           { type: String, default: '' },
    registrationUrl: { type: String, default: '' },
    // Prizes
    prize1:      { type: String, default: '' },
    prize2:      { type: String, default: '' },
    prize3:      { type: String, default: '' },
    totalPrize:  { type: String, default: '' },
    // Contact
    pocName:     { type: String, default: '' },
    pocPhone:    { type: String, default: '' },
    pocEmail:    { type: String, default: '' },
    website:     { type: String, default: '' },
    // Details
    eligibility: { type: String, default: '' },
    rules:       { type: String, default: '' },
    perks:       { type: String, default: '' },
    mode:        { type: String, default: 'Offline' },
    endDate:     { type: String, default: '' },
    bannerImage: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    brochure: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);
export const HostedEvent = mongoose.model('HostedEvent', hostedEventSchema);

// ─────────────────────────────────────────────────

// models/SupportTicket.js
const replySchema = new mongoose.Schema(
  {
    author:   { type: String, enum: ['user', 'admin'], required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name:     { type: String, default: '' },
    message:  { type: String, required: true },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name:       { type: String, required: true },
    email:      { type: String, required: true, lowercase: true },
    issueType:  { type: String, required: true },
    subject:    { type: String, required: true },
    message:    { type: String, required: true },
    status:     { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    resolvedAt: { type: Date, default: null },
    replies:    [replySchema],
  },
  { timestamps: true }
);
export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

// ─────────────────────────────────────────────────

// models/College.js
const collegeSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    city:       { type: String, required: true },
    state:      { type: String, required: true },
    logoEmoji:  { type: String, default: '🏛️' },
    pastEvents: { type: Number, default: 0 },
  },
  { timestamps: true }
);
collegeSchema.index({ name: 'text', city: 'text' });
export const College = mongoose.model('College', collegeSchema);
