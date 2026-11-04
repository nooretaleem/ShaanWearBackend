const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');

const router = express.Router();

// All product routes require active administrator authentication
router.use(authenticate);

// Read endpoints require 'products:read'
router.get('/', requirePermissions('products:read'), getProducts);
router.get('/:id', requirePermissions('products:read'), getProductById);

// Mutation endpoints require 'products:write'
router.post('/', requirePermissions('products:write'), createProduct);
router.patch('/:id', requirePermissions('products:write'), updateProduct);
router.delete('/:id', requirePermissions('products:write'), deleteProduct);

module.exports = router;
