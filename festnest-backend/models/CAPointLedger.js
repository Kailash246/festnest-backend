// models/CAPointLedger.js
// Immutable, auditable point transaction ledger for FestNest Campus Ambassadors
import mongoose from 'mongoose';

const caPointLedgerSchema = new mongoose.Schema(
  {
    caId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CampusAmbassador',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'USER_VERIFIED',
        'ORGANIZER_VERIFIED',
        'ORGANIZER_FIRST_EVENT_APPROVED',
        'POINT_ADJUSTMENT',
        'POINT_REVERSAL',
      ],
      required: true,
      index: true,
    },
    points: {
      type: Number,
      required: true,
    },
    // Deterministic key preventing duplicate attribution or double counting
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'refModel',
      default: null,
    },
    refModel: {
      type: String,
      enum: ['User', 'Event', 'HostedEvent', 'CampusAmbassador'],
      default: 'User',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // creation timestamp managed explicitly via createdAt
  }
);

// Fast compound lookup for newest ledger entries per ambassador
caPointLedgerSchema.index({ caId: 1, createdAt: -1 });
caPointLedgerSchema.index({ caId: 1, type: 1 });

export const CAPointLedger = mongoose.model('CAPointLedger', caPointLedgerSchema);
export default CAPointLedger;

