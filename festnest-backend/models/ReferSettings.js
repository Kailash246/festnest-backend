// models/ReferSettings.js
import mongoose from 'mongoose';

const referSettingsSchema = new mongoose.Schema(
  {
    coinsPerReferral: {
      type: Number,
      default: 10,
      min: 1,
    },
    coinsPerSpin: {
      type: Number,
      default: 200,
      min: 10,
    },
    referralsPerMilestone: {
      type: Number,
      default: 10,
      min: 1,
    },
    registrationsPerMilestone: {
      type: Number,
      default: 5,
      min: 1,
    },
    programActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export const ReferSettings = mongoose.model('ReferSettings', referSettingsSchema);
export default ReferSettings;

