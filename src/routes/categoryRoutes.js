const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');

const router = express.Router();

// All category routes require active administrator authentication
router.use(authenticate);

// Read endpoints require 'products:read'
router.get('/', requirePermissions('products:read'), getCategories);
router.get('/:id', requirePermissions('products:read'), getCategoryById);

// Mutation endpoints require 'products:write'
router.post('/', requirePermissions('products:write'), createCategory);
router.patch('/:id', requirePermissions('products:write'), updateCategory);
router.delete('/:id', requirePermissions('products:write'), deleteCategory);

module.exports = router;
