// models/Spin.js
import mongoose from 'mongoose';

const spinSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    milestoneIndex: {
      type: Number,
      required: true,
    },
    fnCoinsDeducted: {
      type: Number,
      default: 200,
    },
    winningSegmentId: {
      type: String,
      required: true,
    },
    reward: {
      label: { type: String, required: true },
      type: {
        type: String,
        enum: ['cash', 'fn_coins', 'merch', 'bonus_spin', 'none'],
        required: true,
      },
      value: { type: Number, default: null },
    },
    status: {
      type: String,
      enum: [
        'pending',
        'under_review',
        'approved',
        'paid',
        'credited',
        'rejected',
        'cancelled',
      ],
      default: 'pending',
      index: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    statusReason: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

spinSchema.index({ user: 1, createdAt: -1 });
spinSchema.index({ user: 1, milestoneIndex: 1 }, { unique: true });

export const Spin = mongoose.model('Spin', spinSchema);
export default Spin;

