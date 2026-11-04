const http = require('http');
const app = require('./app');
const config = require('./config/env');
const prisma = require('./config/database');

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(` SHAANWEAR Backend API Server Active`);
  console.log(` Environment : ${config.nodeEnv}`);
  console.log(` Port        : ${config.port}`);
  console.log(` Health Check: http://localhost:${config.port}/api/health`);
  console.log(` CORS Allowed: ${config.allowedOrigins.join(', ')}`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n[${signal}] Initiating graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('Prisma database client disconnected.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnect:', err.message);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if lingering connections exist
  setTimeout(() => {
    console.error('Force closing process due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
