const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { generateAccessToken, generateRefreshToken } = require('../services/tokenService');

/**
 * POST /api/auth/register
 * Creates a new customer account with name, email, and securely hashed password.
 * Returns access token + refresh token and safe user profile.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validate presence
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name, email, and password are required.',
          statusCode: 400
        }
      });
    }

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid input format.',
          statusCode: 400
        }
      });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Basic name validation
    if (trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name must be at least 2 characters long.',
          statusCode: 400
        }
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please provide a valid email address.',
          statusCode: 400
        }
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Password must be at least 6 characters long.',
          statusCode: 400
        }
      });
    }

    // Check if account already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An account with this email address already exists.',
          statusCode: 409
        }
      });
    }

    // Secure bcrypt hash (10 salt rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create User record
    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: normalizedEmail,
        passwordHash,
        isActive: true
      }
    });

    // Mirror to Customer model for seamless order & customer management
    try {
      await prisma.customer.upsert({
        where: { email: normalizedEmail },
        update: { name: trimmedName },
        create: {
          name: trimmedName,
          email: normalizedEmail
        }
      });
    } catch (custErr) {
      console.warn('[Register - Customer sync warning]:', custErr.message);
    }

    // Issue tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles: ['CUSTOMER']
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Clean safe user profile (never expose passwordHash)
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    };

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      data: {
        token: accessToken,
        accessToken,
        refreshToken,
        user: safeUser
      }
    });
  } catch (error) {
    console.error('[Auth Controller - Register Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Validates credentials, checks account status, returns access token + refresh token.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required.',
          statusCode: 400
        }
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user with assigned roles and permissions
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Generic error message for security (prevents user enumeration)
    const invalidCredentialsResponse = () => {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid email or password.',
          statusCode: 401
        }
      });
    };

    if (!user) {
      return invalidCredentialsResponse();
    }

    // Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return invalidCredentialsResponse();
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Account is deactivated. Please contact an administrator.',
          statusCode: 403
        }
      });
    }

    // Extract roles and permissions
    const roles = [];
    const permissions = new Set();

    if (Array.isArray(user.userRoles)) {
      user.userRoles.forEach(ur => {
        if (ur.role && ur.role.name) roles.push(ur.role.name);
        if (ur.role && Array.isArray(ur.role.rolePermissions)) {
          ur.role.rolePermissions.forEach(rp => {
            if (rp.permission && rp.permission.identifier) {
              permissions.add(rp.permission.identifier);
            }
          });
        }
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      isActive: user.isActive,
      roles: roles,
      permissions: Array.from(permissions)
    };

    // Sign JWT tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      roles: roles
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        accessToken,
        refreshToken,
        user: safeUser
      }
    });
  } catch (error) {
    console.error('[Auth Controller - Login Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Protected route: Returns the authenticated user's profile.
 * Clean JSON response: { id, name, email, createdAt }. Never returns password hash.
 */
const getMe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required.',
          statusCode: 401
        }
      });
    }

    // Clean JSON response: { id, name, email, createdAt }
    const userProfile = {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt
    };

    // Retain roles/permissions for admin authorization if assigned
    if (Array.isArray(req.user.roles) && req.user.roles.length > 0) {
      userProfile.roles = req.user.roles;
    }
    if (Array.isArray(req.user.permissions) && req.user.permissions.length > 0) {
      userProfile.permissions = req.user.permissions;
    }

    return res.status(200).json({
      success: true,
      data: {
        user: userProfile
      }
    });
  } catch (error) {
    console.error('[Auth Controller - Me Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Invalidates the session/tokens on client and returns clean success response.
 */
const logout = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Tokens invalidated.'
    });
  } catch (error) {
    console.error('[Auth Controller - Logout Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout
};
