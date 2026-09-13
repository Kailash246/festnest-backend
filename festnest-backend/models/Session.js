// models/Session.js
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number, // total active time in seconds
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    device: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    referrer: {
      type: String,
      default: '',
    },
    currentPage: {
      type: String,
      default: '',
    },
    pageViewsCount: {
      type: Number,
      default: 0,
    },
    actionsCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ user: 1, createdAt: -1 });
sessionSchema.index({ user: 1, lastHeartbeat: -1 });
sessionSchema.index({ createdAt: -1 });

export default mongoose.model('Session', sessionSchema);
