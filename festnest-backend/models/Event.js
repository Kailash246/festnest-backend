// models/Event.js
import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    slug:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:      { type: String, required: true, trim: true },
    emoji:     { type: String, default: '🎉' },
    bgClass:   { type: String, default: 'bg1' },

    category:  {
      type: String,
      required: true,
      enum: ['Hackathon', 'Cultural Fest', 'Technical Fest', 'Workshop', 'Competition', 'Sports', 'Other'],
    },
    entryType: {
      type: String,
      required: true,
      enum: ['free', 'paid', 'prize'],
    },

    organiser: {
      name:     { type: String, required: true },
      logo:     { type: String, default: '🏛️' },
      location: { type: String, default: '' },
      sub:      { type: String, default: '' },
    },

    college:  { type: String, required: true },
    city:     { type: String, required: true },

    date: {
      start:    { type: String, required: true },  // human-readable, e.g. "18–19 May 2025"
      time:     { type: String, default: '' },
      deadlineDays: { type: Number, default: 0 },
    },

    venue:    { type: String, default: '' },
    teamSize: { type: String, default: '' },

    badge: {
      text:  { type: String, default: '' },
      class: { type: String, default: '' },
    },

    price: {
      display: { type: String, default: 'Free' },
      note:    { type: String, default: '' },
    },

    image: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    tags:       [{ type: String }],
    highlights: [{ type: String }],
    about:      { type: String, default: '' },

    registrationUrl: { type: String, default: '#' },

    stats: {
      registrationCount: { type: Number, default: 0 },
      viewCount:         { type: Number, default: 0 },
    },

    trending: {
      rank:  { type: Number, default: null },
      views: { type: String, default: '' },
      extra: { type: String, default: '' },
    },

    // Extended fields (from HostEvent form / admin approval)
    prize1:      { type: String, default: '' },
    prize2:      { type: String, default: '' },
    prize3:      { type: String, default: '' },
    totalPrize:  { type: String, default: '' },
    pocName:     { type: String, default: '' },
    pocPhone:    { type: String, default: '' },
    pocEmail:    { type: String, default: '' },
    website:     { type: String, default: '' },
    eligibility: { type: String, default: '' },
    rules:       { type: String, default: '' },
    perks:       { type: String, default: '' },
    mode:        { type: String, default: '' },

    brochure: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    hostedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isActive:   { type: Boolean, default: true },
    isApproved: { type: Boolean, default: true },
    isFeatured:    { type: Boolean, default: false },
    featuredOrder: { type: Number,  default: 0 },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject:{ virtuals: true },
  }
);

eventSchema.index({ category: 1 });
eventSchema.index({ city: 1 });
eventSchema.index({ entryType: 1 });
eventSchema.index({ 'trending.rank': 1 });
eventSchema.index({ name: 'text', college: 'text', city: 'text', category: 'text' });
eventSchema.index({ isFeatured: 1, featuredOrder: 1 });

export default mongoose.model('Event', eventSchema);
