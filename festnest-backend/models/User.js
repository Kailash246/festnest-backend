// models/User.js
import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },

    role: {
      type:    String,
      enum:    ['user', 'organizer', 'admin', 'superadmin'],
      default: 'user',
    },

    college: { type: String, default: '' },
    city:    { type: String, default: '' },
    year:    { type: String, default: '' },
    branch:  { type: String, default: '' },

    interests: [{ type: String }],

    avatar: {
      url:       { type: String, default: '' },
      publicId:  { type: String, default: '' },
      initials:  { type: String, default: '' },
    },

    points:       { type: Number, default: 0 },
    referralCode: { type: String, unique: true, sparse: true },

    isEmailVerified: { type: Boolean, default: false },
    isBanned:        { type: Boolean, default: false },

    notificationPrefs: {
      deadlines: { type: Boolean, default: true },
      updates:   { type: Boolean, default: true },
      system:    { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

/* ── Hash password before save ── */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);

  if (this.isModified('name') || !this.avatar.initials) {
    this.avatar.initials = this.name
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  next();
});

/* ── Auto-set initials when name changes ── */
userSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();
  if (update.name) {
    update['avatar.initials'] = update.name
      .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

userSchema.methods.isAdmin = function () {
  return this.role === 'admin' || this.role === 'superadmin';
};

export default mongoose.model('User', userSchema);
