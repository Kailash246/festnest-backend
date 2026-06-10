// models/OTP.js
import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs';

const OTP_EXPIRY_MINUTES = 10;

const otpSchema = new mongoose.Schema(
  {
    email:     { type: String, required: true, lowercase: true },
    otpHash:   { type: String, required: true },
    purpose:   {
      type:    String,
      enum:    ['verify_email', 'login', 'reset_password'],
      default: 'verify_email',
    },
    expiresAt: { type: Date, required: true },
    used:      { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-delete after expiry via MongoDB TTL index
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for quick lookup
otpSchema.index({ email: 1, purpose: 1 });

/* ── Static: create + hash a new OTP ── */
otpSchema.statics.createOTP = async function (email, purpose = 'verify_email') {
  // Invalidate any existing unused OTPs for same email+purpose
  await this.deleteMany({ email: email.toLowerCase(), purpose, used: false });

  const code    = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await this.create({ email: email.toLowerCase(), otpHash, purpose, expiresAt });
  return code; // plain code – send via email, never store plain
};

/* ── Static: verify OTP ── */
otpSchema.statics.verifyOTP = async function (email, code, purpose = 'verify_email') {
  const record = await this.findOne({
    email:     email.toLowerCase(),
    purpose,
    used:      false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record) return false;

  const valid = await bcrypt.compare(code, record.otpHash);
  if (!valid)  return false;

  record.used = true;
  await record.save();
  return true;
};

export default mongoose.model('OTP', otpSchema);
