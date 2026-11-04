const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Generate a signed JWT for an authenticated admin user.
 * Payload includes the user ID, email, and role names.
 */
const generateToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

/**
 * Verify and decode an incoming JWT.
 */
const verifyToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

module.exports = {
  generateToken,
  verifyToken
};
