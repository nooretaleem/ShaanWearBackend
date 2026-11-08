const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, getMe, logout } = require('../controllers/authController');
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

// Rate limiter for registration attempts (15 requests per 15 minutes per IP)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    error: {
      message: 'Too many registration requests from this IP. Please try again later.',
      statusCode: 429
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/me', authenticate, getMe);
router.post('/logout', logout);

module.exports = router;
