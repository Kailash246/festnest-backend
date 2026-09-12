// models/RewardConfig.js
import mongoose from 'mongoose';

const rewardConfigSchema = new mongoose.Schema(
  {
    segmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['cash', 'fn_coins', 'merch', 'bonus_spin', 'none'],
      required: true,
    },
    value: {
      type: Number,
      default: null,
    },
    probability: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    inventory: {
      type: Number,
      default: null, // null = unlimited
    },
    maxWinners: {
      type: Number,
      default: null,
    },
    totalWon: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

rewardConfigSchema.index({ isActive: 1, order: 1 });

export const RewardConfig = mongoose.model('RewardConfig', rewardConfigSchema);
export default RewardConfig;

