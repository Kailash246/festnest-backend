// models/Competition.js
import mongoose from 'mongoose';

const competitionSchema = new mongoose.Schema(
  {
    event:            { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    name:             { type: String, required: true, trim: true, maxlength: 120 },
    description:      { type: String, default: '', trim: true, maxlength: 1000 },
    eligibility:      { type: String, default: '', trim: true, maxlength: 300 },
    registrationFee:  { type: String, default: '', trim: true, maxlength: 40 },
    prizeDetails:     { type: String, default: '', trim: true, maxlength: 300 },
    venue:            { type: String, default: '', trim: true, maxlength: 160 },
    teamSize:         { type: String, default: '', trim: true, maxlength: 80 },
    format:           { type: String, default: '', trim: true, maxlength: 120 },
    duration:         { type: String, default: '', trim: true, maxlength: 120 },
    rules:            { type: String, default: '', trim: true, maxlength: 1500 },
    registrationLink: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

competitionSchema.index({ event: 1, createdAt: 1 });

export default mongoose.model('Competition', competitionSchema);
