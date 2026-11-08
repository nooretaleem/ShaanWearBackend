const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Generate a signed short-lived access JWT for an authenticated user.
 * Payload includes the user ID, email, and role names.
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn || '24h'
  });
};

/**
 * Generate a signed refresh JWT with longer validity (7 days).
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '7d'
  });
};

/**
 * Alias for generateAccessToken to ensure backwards compatibility.
 */
const generateToken = (payload) => {
  return generateAccessToken(payload);
};

/**
 * Verify and decode an incoming JWT.
 */
const verifyToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

/**
 * Verify a refresh token.
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

module.exports = {
  generateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken
};
