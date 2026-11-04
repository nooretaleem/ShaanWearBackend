const { PrismaClient } = require('@prisma/client');
const config = require('./env');

// Singleton Prisma client instance
let prisma;

if (config.nodeEnv === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn']
  });
} else {
  // Prevent multiple client instances during development hot-reloading
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['error', 'warn']
    });
  }
  prisma = global.prisma;
}

module.exports = prisma;
