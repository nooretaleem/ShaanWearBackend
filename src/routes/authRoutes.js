const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, getMe, logout } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Strict rate limiter for login attempts (10 requests per 15 minutes per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: {
      message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
      statusCode: 429
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication routes
router.post('/login', loginLimiter, login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
