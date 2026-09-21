// models/CARewardSnapshot.js
// Frozen snapshot records for monthly and final CA reward cycles
import mongoose from 'mongoose';

const caRewardSnapshotSchema = new mongoose.Schema(
  {
    periodType: {
      type: String,
      enum: ['monthly', 'final'],
      required: true,
      index: true,
    },
    // e.g. "2026-03" for March 2026 monthly or "final-2026"
    periodKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    caId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampusAmbassador',
      required: true,
      index: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    points: {
      type: Number,
      required: true,
    },
    metrics: {
      verifiedUsers: { type: Number, default: 0 },
      approvedEvents: { type: Number, default: 0 },
      verifiedOrganizers: { type: Number, default: 0 },
    },
    isEligible: {
      type: Boolean,
      required: true,
    },
    rewardAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['NOT_ELIGIBLE', 'ELIGIBLE', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED'],
      default: 'NOT_ELIGIBLE',
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paymentReference: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Enforces single snapshot record per ambassador per evaluation period
caRewardSnapshotSchema.index({ periodKey: 1, caId: 1 }, { unique: true });
caRewardSnapshotSchema.index({ periodKey: 1, rank: 1 });

export const CARewardSnapshot = mongoose.model('CARewardSnapshot', caRewardSnapshotSchema);
export default CARewardSnapshot;

