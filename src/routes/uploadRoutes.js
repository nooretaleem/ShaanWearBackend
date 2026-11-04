const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const { uploadSingleProductImage } = require('../middleware/uploadMiddleware');
const { uploadProductImage, deleteProductImage } = require('../controllers/uploadController');

const router = express.Router();

/**
 * All upload endpoints require authentication and 'products:write' permission
 */
router.use(authenticate);
router.use(requirePermissions('products:write'));

/**
 * POST /api/uploads/product-images
 * Upload a single product image to Cloudinary
 */
router.post('/product-images', uploadSingleProductImage, uploadProductImage);

/**
 * DELETE /api/uploads/product-images
 * Delete an image asset from Cloudinary
 */
router.delete('/product-images', deleteProductImage);

module.exports = router;
