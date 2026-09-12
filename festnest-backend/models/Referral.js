// models/Referral.js
import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // Permanent single referrer constraint
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'invalid'],
      default: 'pending',
      index: true,
    },
    fnCoinsAwarded: {
      type: Number,
      default: 10,
    },
    eventStatus: {
      type: String,
      enum: ['registered', 'not_registered', 'pending'],
      default: 'not_registered',
    },
    eventRegistrationVerificationSource: {
      type: String,
      enum: [
        'organizer_api',
        'organizer_webhook',
        'festnest_registration',
        'verified_import',
        'manual_admin_verification',
        null,
      ],
      default: null,
    },
    registeredEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null,
    },
    eventRegisteredAt: {
      type: Date,
      default: null,
    },
    invalidatedAt: {
      type: Date,
      default: null,
    },
    invalidationReason: {
      type: String,
      default: '',
    },
    invalidatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    signupIp: {
      type: String,
      default: '',
    },
    userAgent: {
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

referralSchema.index({ referrer: 1, createdAt: -1 });
referralSchema.index({ referrer: 1, status: 1 });

export const Referral = mongoose.model('Referral', referralSchema);
export default Referral;

