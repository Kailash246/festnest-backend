// models/CAReferralLog.js
import mongoose from 'mongoose';

const caReferralLogSchema = new mongoose.Schema(
  {
    caId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampusAmbassador',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['organizer', 'event', 'student'],
      required: true,
      index: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    refModel: {
      type: String,
      default: '',
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

// Fast compound lookup for newest logs per ambassador
caReferralLogSchema.index({ caId: 1, createdAt: -1 });

export const CAReferralLog = mongoose.model('CAReferralLog', caReferralLogSchema);
export default CAReferralLog;
