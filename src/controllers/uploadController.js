const cloudinaryService = require('../services/cloudinaryService');

/**
 * POST /api/uploads/product-images
 * Upload a product image buffer to Cloudinary with automatic optimization.
 */
const uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No image file provided. Please attach an image file with key "image".',
          statusCode: 400
        }
      });
    }

    const uploadResult = await cloudinaryService.uploadImage(req.file.buffer, {
      folder: 'shaanwear/products'
    });

    return res.status(201).json({
      success: true,
      message: 'Product image uploaded successfully.',
      data: {
        publicId: uploadResult.publicId,
        secureUrl: uploadResult.secureUrl,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        bytes: uploadResult.bytes
      }
    });
  } catch (error) {
    console.error('[Upload Controller - Upload Image Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/uploads/product-images
 * Delete a product image from Cloudinary by public_id.
 */
const deleteProductImage = async (req, res, next) => {
  try {
    const publicId = (req.body && (req.body.publicId || req.body.public_id)) || 
                     req.query.publicId || 
                     req.query.public_id;

    if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cloudinary public_id is required.',
          statusCode: 400
        }
      });
    }

    const trimmedPublicId = publicId.trim();
    const deleteResult = await cloudinaryService.deleteImage(trimmedPublicId);

    if (deleteResult.result === 'not found') {
      return res.status(404).json({
        success: false,
        error: {
          message: `Image with public_id '${trimmedPublicId}' not found on Cloudinary.`,
          statusCode: 404
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product image deleted successfully from Cloudinary.',
      data: {
        publicId: trimmedPublicId,
        result: deleteResult.result
      }
    });
  } catch (error) {
    console.error('[Upload Controller - Delete Image Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  uploadProductImage,
  deleteProductImage
};
