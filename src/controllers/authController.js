const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { generateToken } = require('../services/tokenService');

/**
 * POST /api/auth/login
 * Validates credentials, checks account status, returns JWT and safe user profile.
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

    user.userRoles.forEach(ur => {
      roles.push(ur.role.name);
      ur.role.rolePermissions.forEach(rp => {
        permissions.add(rp.permission.identifier);
      });
    });

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: roles,
      permissions: Array.from(permissions)
    };

    // Sign JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      roles: roles
    });

    return res.status(200).json({
      success: true,
      data: {
        token: token,
        user: safeUser
      }
    });
  } catch (error) {
    console.error('[Auth Controller - Login Error]:', error.message);
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and permissions.
 */
const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('[Auth Controller - Me Error]:', error.message);
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * For stateless JWT tokens, client clears the stored token from storage.
 */
const logout = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Please remove access token from client storage.'
    });
  } catch (error) {
    console.error('[Auth Controller - Logout Error]:', error.message);
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  logout
};
