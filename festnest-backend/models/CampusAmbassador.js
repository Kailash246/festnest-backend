// models/CampusAmbassador.js
import mongoose from 'mongoose';

const auditLogEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // 'applied', 'screening', 'approved', 'rejected', 'stat_adjustment'
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: 'System' },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const campusAmbassadorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, lowercase: true, trim: true, index: true },
    phone:  { type: String, required: true, trim: true, index: true },
    city:   { type: String, required: true, trim: true, index: true },
    college:{ type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    year:   { type: String, default: '', trim: true },
    instagram: { type: String, default: '', trim: true },
    why:    { type: String, required: true, trim: true },
    referredByCode: { type: String, default: '', trim: true },
    name:       { type: String, required: true, trim: true },
    email:      { type: String, required: true, lowercase: true, trim: true, index: true },
    phone:      { type: String, required: true, trim: true, index: true },
    college:    { type: String, required: true, trim: true },
    city:       { type: String, required: true, trim: true, index: true },
    course:     { type: String, required: true, trim: true },
    why:        { type: String, required: true, trim: true },
    instagram:  { type: String, default: '', trim: true },

    // City code used for deterministic sequential ID generation (e.g. 'BLR', 'PUN', 'DEL')
    cityCode: { type: String, default: '', trim: true },
    referralCodeUsed: { type: String, default: '', trim: true },
    referredByCode:   { type: String, default: '', trim: true }, // backwards-compatible alias

    // Generated server-side upon admin approval
    caId: { type: String, unique: true, sparse: true, index: true }, // e.g. "FN-CA-BLR-014"
    referralCode: { type: String, unique: true, sparse: true, index: true }, // e.g. "FN-BLR-014"

    status: {
      type: String,
      enum: ['applied', 'screening', 'approved', 'rejected'],
      enum: ['applied', 'approved', 'rejected'],
      default: 'applied',
      index: true,
    },

    caId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      uppercase: true,
      trim: true,
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      uppercase: true,
      trim: true,
    },

    tier: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'City Lead'],
      default: 'Bronze',
    },

    validThru: { type: String, default: '' }, // e.g. "09 / 2028"
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    stats: {
      organizersOnboarded: { type: Number, default: 0 },
      eventsSourced:       { type: Number, default: 0 },
      referralSignups:     { type: Number, default: 0 },
    },

    photoUrl:   { type: String, default: null },
    appliedAt:  { type: Date, default: Date.now },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    notes: { type: String, default: '' },

    // Audit-tracked manual adjustments (added on top of real derived stats)
    adjustments: {
      organizersOnboarded: { type: Number, default: 0 },
      eventsSourced: { type: Number, default: 0 },
      referralSignups: { type: Number, default: 0 },
    },
    cityCode:   { type: String, default: '', trim: true },
    validThru:  { type: String, default: '' },

    auditLog: [auditLogEntrySchema],
    // Guards against double-counting organizers for stats.organizersOnboarded
    referredOrganizerIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],
  },
  { timestamps: true }
);

campusAmbassadorSchema.index({ email: 1, status: 1 });
campusAmbassadorSchema.index({ phone: 1, status: 1 });

export const CampusAmbassador = mongoose.model('CampusAmbassador', campusAmbassadorSchema);
export default CampusAmbassador;

