const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const {
  validateCoupon,
  getDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount
} = require('../controllers/discountController');

const router = express.Router();

// 1. Public storefront endpoint for coupon code validation (unauthenticated)
router.post('/validate', validateCoupon);

// 2. Admin management endpoints (require active administrator authentication)
router.use(authenticate);

// Read endpoints require 'orders:read'
router.get('/', requirePermissions('orders:read'), getDiscounts);
router.get('/:id', requirePermissions('orders:read'), getDiscountById);

// Mutation endpoints require 'orders:manage'
router.post('/', requirePermissions('orders:manage'), createDiscount);
router.patch('/:id', requirePermissions('orders:manage'), updateDiscount);
router.delete('/:id', requirePermissions('orders:manage'), deleteDiscount);

module.exports = router;
