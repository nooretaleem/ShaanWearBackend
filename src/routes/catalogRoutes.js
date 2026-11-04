const express = require('express');
const router = express.Router();
const {
  getPublicCategories,
  getPublicCategoryById,
  getPublicProducts,
  getPublicProductById
} = require('../controllers/catalogController');

/**
 * SHAANWEAR Public Catalog Routes
 * Safe, read-only endpoints accessible without authentication.
 * Mutating methods (POST, PUT, PATCH, DELETE) are NOT mounted here.
 */

// Category Endpoints
router.get('/categories', getPublicCategories);
router.get('/categories/:id', getPublicCategoryById);

// Product Endpoints
router.get('/products', getPublicProducts);
router.get('/products/:id', getPublicProductById);

module.exports = router;
