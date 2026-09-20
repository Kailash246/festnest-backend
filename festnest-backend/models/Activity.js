// models/Activity.js
import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
      default: 'action',
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    page: {
      path:  { type: String, default: '' },
      title: { type: String, default: '' },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    durationOnPage: {
      type: Number, // duration on previous page in seconds (if reported)
      default: 0,
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ createdAt: -1 });
activitySchema.index({ user: 1, type: 1 });

export default mongoose.model('Activity', activitySchema);

