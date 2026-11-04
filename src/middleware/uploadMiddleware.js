const multer = require('multer');
const path = require('path');

// Strictly allowed MIME types and extensions
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
]);

// Maximum file size: 5 MB
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Memory storage to ensure zero temporary files are written to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  // Strict check: explicitly reject SVG and non-whitelisted formats
  if (mime.includes('svg') || ext === '.svg') {
    const error = new Error('SVG images are strictly prohibited for security reasons.');
    error.statusCode = 400;
    return cb(error, false);
  }

  if (!ALLOWED_MIME_TYPES.has(mime) || !ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error(`Unsupported file type. Only JPEG, PNG, and WebP images are permitted.`);
    error.statusCode = 400;
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1 // Single file upload
  },
  fileFilter: fileFilter
});

// Middleware wrapper for single product image upload
const uploadSingleProductImage = (req, res, next) => {
  const singleUploader = upload.single('image');

  singleUploader(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              message: `File size exceeds the maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
              statusCode: 400,
              code: 'LIMIT_FILE_SIZE'
            }
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            error: {
              message: `Unexpected upload field. Please upload using the form field 'image'.`,
              statusCode: 400,
              code: 'LIMIT_UNEXPECTED_FILE'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            message: `File upload error: ${err.message}`,
            statusCode: 400
          }
        });
      }

      // Custom validation errors (e.g. invalid file type or SVG rejection)
      return res.status(err.statusCode || 400).json({
        success: false,
        error: {
          message: err.message,
          statusCode: err.statusCode || 400
        }
      });
    }

    next();
  });
};

module.exports = {
  uploadSingleProductImage,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES
};
