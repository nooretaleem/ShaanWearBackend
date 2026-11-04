const express = require('express');
const { authenticate, requirePermissions } = require('../middleware/authMiddleware');
const { getCustomers } = require('../controllers/customerController');

const router = express.Router();

router.use(authenticate);

// No dedicated 'customers:read' permission exists yet; customers are derived from orders,
// so 'orders:read' gates access (avoids locking out existing roles).
router.get('/', requirePermissions('orders:read'), getCustomers);

module.exports = router;

