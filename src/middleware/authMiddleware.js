const prisma = require('../config/database');
const { verifyToken } = require('../services/tokenService');

/**
 * Authentication Middleware
 * Validates Bearer token, fetches active user with roles and permissions from database.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. No Bearer token provided.',
          statusCode: 401
        }
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token format.',
          statusCode: 401
        }
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired token.',
          statusCode: 401
        }
      });
    }

    // Fetch user from DB to verify active status and current roles/permissions
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User account not found.',
          statusCode: 401
        }
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'User account is deactivated. Access denied.',
          statusCode: 403
        }
      });
    }

    // Extract roles and permissions into flat sets
    const roles = [];
    const permissions = new Set();

    user.userRoles.forEach(ur => {
      roles.push(ur.role.name);
      ur.role.rolePermissions.forEach(rp => {
        permissions.add(rp.permission.identifier);
      });
    });

    // Attach safe user object to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      isActive: user.isActive,
      roles: roles,
      permissions: Array.from(permissions)
    };

    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error.message);
    next(error);
  }
};

/**
 * Role-Based Access Control Middleware
 * @param  {...string} requiredRoles - Array of allowed role names (e.g. 'SUPER_ADMIN')
 */
const requireRoles = (...requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.', statusCode: 401 }
      });
    }

    const hasRole = req.user.roles.some(role => requiredRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Forbidden. You do not have the required role to perform this action.',
          statusCode: 403
        }
      });
    }

    next();
  };
};

/**
 * Permission-Based Access Control Middleware
 * @param  {...string} requiredPermissions - Array of required permission identifiers (e.g. 'products:write')
 */
const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.', statusCode: 401 }
      });
    }

    const hasPermission = requiredPermissions.every(perm => req.user.permissions.includes(perm));
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Forbidden. You do not have the required permissions to perform this action.',
          statusCode: 403
        }
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  requireRoles,
  requirePermissions
};
