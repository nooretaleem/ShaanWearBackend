const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const {
  // Address Book
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,

  // Order History
  getCustomerOrders,
  getCustomerOrderById,

  // Cart & Cart Migration
  getCart,
  migrateCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,

  // Wishlist & Move to Cart
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart
} = require('../controllers/customerDashboardController');

const router = express.Router();

// All customer dashboard operations require authenticated session
router.use(authenticate);

/* --------------------------------------------------------------------------
 * 1. ADDRESS BOOK
 * -------------------------------------------------------------------------- */
router.get('/addresses', getAddresses);
router.post('/addresses', addAddress);
router.put('/addresses/:id', updateAddress);
router.delete('/addresses/:id', deleteAddress);
router.patch('/addresses/:id/default', setDefaultAddress);

/* --------------------------------------------------------------------------
 * 2. ORDER HISTORY
 * -------------------------------------------------------------------------- */
router.get('/orders', getCustomerOrders);
router.get('/orders/:id', getCustomerOrderById);

/* --------------------------------------------------------------------------
 * 3. PERSISTENT CART & GUEST CART MIGRATION
 * -------------------------------------------------------------------------- */
router.get('/cart', getCart);
router.post('/cart/migrate', migrateCart);
router.post('/cart/merge', migrateCart); // convenient alias
router.post('/cart/items', addToCart);
router.patch('/cart/items/:id', updateCartItem);
router.delete('/cart/items/:id', removeCartItem);
router.delete('/cart', clearCart);

/* --------------------------------------------------------------------------
 * 4. PERSISTENT WISHLIST & MOVE TO CART
 * -------------------------------------------------------------------------- */
router.get('/wishlist', getWishlist);
router.post('/wishlist/items', addToWishlist);
router.delete('/wishlist/items/:productId', removeFromWishlist);
router.post('/wishlist/move-to-cart', moveToCart);

module.exports = router;

