// config/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Event banner + brochure (shared storage, params differ by fieldname) ── */
const eventFilesStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    if (file.fieldname === 'brochure') {
      return {
        folder:        'festnest/brochures',
        resource_type: 'raw',          // required for non-image files
        format:        'pdf',
        allowed_formats: ['pdf'],
      };
    }
    // bannerImage — pre-cropped 16:9 JPEG from the frontend cropper
    return {
      folder:          'festnest/events',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation:  [{ width: 1280, height: 720, crop: 'fill', quality: 'auto' }],
    };
  },
});

export const uploadEventFiles = multer({
  storage: eventFilesStorage,
  limits:  { fileSize: 25 * 1024 * 1024 }, // 25 MB covers both images and PDFs
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.fieldname === 'brochure'
        ? ['application/pdf']
        : ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
}).fields([
  { name: 'bannerImage', maxCount: 1 },
  { name: 'brochure',    maxCount: 1 },
]);

/* ── User avatar uploads ── */
export const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'festnest/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 300, height: 300, crop: 'fill', gravity: 'face', quality: 'auto' }],
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits:  { fileSize: 2 * 1024 * 1024 },
});

// Keep the old name as an alias so any other code that imports it doesn't break
export const uploadEventImage = uploadEventFiles;

export { cloudinary };
export default cloudinary;
