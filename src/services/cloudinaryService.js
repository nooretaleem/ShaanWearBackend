const cloudinary = require('cloudinary').v2;
const streamifier = require('stream');
const config = require('../config/env');

/**
 * Validates if all required Cloudinary environment variables are set.
 * @returns {boolean}
 */
const isConfigured = () => {
  return Boolean(
    config.cloudinary.cloudName &&
    config.cloudinary.apiKey &&
    config.cloudinary.apiSecret
  );
};

/**
 * Configure Cloudinary instance with credentials from environment.
 */
const configureCloudinary = () => {
  if (isConfigured()) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true
    });
  }
};

// Initialize configuration
configureCloudinary();

/**
 * Uploads an image buffer directly to Cloudinary using upload_stream.
 * Strict memory-based streaming without persisting files to disk.
 *
 * @param {Buffer} fileBuffer - In-memory buffer of the image
 * @param {Object} options - Upload options
 * @param {string} [options.folder='shaanwear/products'] - Cloudinary destination folder
 * @param {string} [options.publicId] - Optional custom public ID
 * @returns {Promise<{publicId: string, secureUrl: string, format: string, width: number, height: number, bytes: number, createdAt: string}>}
 */
const uploadImage = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      const err = new Error('Cloudinary service is not configured. Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.');
      err.statusCode = 500;
      return reject(err);
    }

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      const err = new Error('Invalid image file buffer provided for upload.');
      err.statusCode = 400;
      return reject(err);
    }

    const folder = options.folder || 'shaanwear/products';
    const uploadOptions = {
      folder: folder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ]
    };

    if (options.publicId) {
      uploadOptions.public_id = options.publicId;
    }

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        console.error('[Cloudinary Upload Error]:', error.message || error);
        return reject(error);
      }
      resolve({
        publicId: result.public_id,
        secureUrl: result.secure_url,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        createdAt: result.created_at
      });
    });

    // Write buffer to stream and end
    stream.end(fileBuffer);
  });
};

/**
 * Deletes an image from Cloudinary by its public ID.
 *
 * @param {string} publicId - The Cloudinary public_id of the image
 * @returns {Promise<{result: string, publicId: string}>}
 */
const deleteImage = async (publicId) => {
  if (!isConfigured()) {
    const err = new Error('Cloudinary service is not configured. Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.');
    err.statusCode = 500;
    throw err;
  }

  if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
    const err = new Error('Valid Cloudinary public_id is required.');
    err.statusCode = 400;
    throw err;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId.trim(), {
      resource_type: 'image',
      invalidate: true
    });

    return {
      result: result.result, // 'ok' or 'not found'
      publicId: publicId.trim()
    };
  } catch (error) {
    console.error('[Cloudinary Destroy Error]:', error.message || error);
    throw error;
  }
};

module.exports = {
  isConfigured,
  configureCloudinary,
  uploadImage,
  deleteImage,
  cloudinaryInstance: cloudinary
};
