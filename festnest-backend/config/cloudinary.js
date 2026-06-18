// config/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Allowed types ─────────────────────────────────────── */
const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const IMAGE_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/* ── Upload buffer to Cloudinary ────────────────────────── */
export function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });
}

/* ── Multer: avatar images only (5 MB) ──────────────────── */
export const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_MIME.has(file.mimetype) || !IMAGE_EXT.has(ext)) {
      return cb(Object.assign(
        new Error('Avatar must be a JPG, JPEG, PNG or WEBP image (max 5 MB)'),
        { status: 400 }
      ));
    }
    cb(null, true);
  },
}).single('avatar');

/* ── Multer: event files — banner image + PDF brochure ──── */
// Outer limit is 10 MB to cover PDFs; banner images are checked ≤ 5 MB in the controller.
export const uploadEventFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'bannerImage') {
      if (!IMAGE_MIME.has(file.mimetype) || !IMAGE_EXT.has(ext)) {
        return cb(Object.assign(
          new Error('Poster must be a JPG, JPEG, PNG or WEBP image'),
          { status: 400 }
        ));
      }
    } else if (file.fieldname === 'brochure') {
      if (file.mimetype !== 'application/pdf' || ext !== '.pdf') {
        return cb(Object.assign(
          new Error('Brochure must be a PDF file'),
          { status: 400 }
        ));
      }
    } else {
      return cb(Object.assign(new Error('Unexpected file field'), { status: 400 }));
    }
    cb(null, true);
  },
}).fields([
  { name: 'bannerImage', maxCount: 1 },
  { name: 'brochure',    maxCount: 1 },
]);

/* ── Upload helpers ──────────────────────────────────────── */
export async function uploadEventBanner(buffer) {
  return uploadToCloudinary(buffer, {
    folder:          'festnest/events',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 630, crop: 'fill', quality: 'auto' }],
  });
}

export async function uploadUserAvatar(buffer) {
  return uploadToCloudinary(buffer, {
    folder:          'festnest/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 300, height: 300, crop: 'fill', gravity: 'face', quality: 'auto' }],
  });
}

export async function uploadBrochure(buffer) {
  return uploadToCloudinary(buffer, {
    folder:        'festnest/brochures',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  });
}

export { cloudinary };
export default cloudinary;
