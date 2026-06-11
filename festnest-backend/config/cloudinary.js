// config/cloudinary.js
// Uses cloudinary v2 directly — no multer-storage-cloudinary needed.
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Upload a buffer to Cloudinary ── */
export function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });
}

/* ── Multer: memory storage (we upload manually after) ── */
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','image/jpg','application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

/* ── Named multer middleware ── */
export const uploadEventImage  = memoryUpload.single('bannerImage');
export const uploadEventFiles  = memoryUpload.fields([
  { name: 'bannerImage', maxCount: 1 },
  { name: 'brochure',    maxCount: 1 },
]);
export const uploadAvatar = memoryUpload.single('avatar');

/* ── Upload helpers (call these with req.file.buffer) ── */
export async function uploadEventBanner(buffer) {
  return uploadToCloudinary(buffer, {
    folder:         'festnest/events',
    allowed_formats: ['jpg','jpeg','png','webp'],
    transformation: [{ width: 1200, height: 630, crop: 'fill', quality: 'auto' }],
  });
}

export async function uploadUserAvatar(buffer) {
  return uploadToCloudinary(buffer, {
    folder:         'festnest/avatars',
    allowed_formats: ['jpg','jpeg','png','webp'],
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face', quality: 'auto' }],
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