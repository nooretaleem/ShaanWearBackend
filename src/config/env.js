const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`\x1b[31m[FATAL CONFIG ERROR] Missing required environment variable: ${envVar}\x1b[0m`);
    process.exit(1);
  }
}

// Parse allowed CORS origins
const parseOrigins = () => {
  const allowed = [];
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) allowed.push(trimmed);
    });
  }
  if (process.env.ADMIN_URL) {
    process.env.ADMIN_URL.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) allowed.push(trimmed);
    });
  }
  return allowed.length > 0 ? allowed : ['http://127.0.0.1:5500', 'http://localhost:4200', 'http://localhost:5500', 'https://shaanwear.vercel.app', 'https://shaanwearwebsite.vercel.app'];
};

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  allowedOrigins: parseOrigins(),
  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim()
  }
};
