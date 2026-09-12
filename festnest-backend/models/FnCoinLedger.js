// models/FnCoinLedger.js
import mongoose from 'mongoose';

const fnCoinLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'referral_reward',
        'spin_cost',
        'spin_reward_coins',
        'fraud_reversal',
        'admin_adjustment',
      ],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    referenceModel: {
      type: String,
      enum: ['Referral', 'Spin', 'User', null],
      default: null,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: '',
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
  { timestamps: false }
);

fnCoinLedgerSchema.index({ user: 1, createdAt: -1 });
fnCoinLedgerSchema.index({ referenceModel: 1, referenceId: 1 });

export const FnCoinLedger = mongoose.model('FnCoinLedger', fnCoinLedgerSchema);
export default FnCoinLedger;

