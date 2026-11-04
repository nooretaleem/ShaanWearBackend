const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const {
  getOrders,
  getOrderById,
  updateOrderStatus,
  createStorefrontOrder
} = require('../controllers/orderController');

const router = express.Router();

// 1. Public storefront endpoint: Order placement during checkout (unauthenticated)
router.post('/', createStorefrontOrder);

// 2. All administrative order endpoints require active administrator authentication
router.use(authenticate);

// Read endpoints require 'orders:read'
router.get('/', requirePermissions('orders:read'), getOrders);
router.get('/:id', requirePermissions('orders:read'), getOrderById);

// Mutation endpoints require 'orders:manage'
router.patch('/:id/status', requirePermissions('orders:manage'), updateOrderStatus);

module.exports = router;

