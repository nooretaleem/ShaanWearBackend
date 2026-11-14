const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const orderRoutes = require('./routes/orderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const customerDashboardRoutes = require('./routes/customerDashboardRoutes');
const discountRoutes = require('./routes/discountRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Basic HTTP security headers (allow cross-origin resources for API consumers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Explicit allowed CORS origins list
const explicitAllowedOrigins = [
  'https://shaanwearwebsite.vercel.app',
  'https://shaanwear.vercel.app',
  'https://shaanwearadmin.vercel.app',
  'https://shaan-wear-admin.vercel.app',
  'https://shalimaradmin.vercel.app',
  'https://shaanwear.com',
  'https://www.shaanwear.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:4200',
  ...(config.allowedOrigins || [])
];
// Configurable CORS allowlist
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g., Postman, curl, server-to-server) with no origin
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');
    const isExplicit = explicitAllowedOrigins.indexOf(cleanOrigin) !== -1;
    const isVercelProjectOrigin = /^https:\/\/[a-z0-9-]*(shaan|shalimar)[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin);
    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);

    if (isExplicit || isVercelProjectOrigin || isLocalDevOrigin) {
      // Reflect the specific matched origin so Access-Control-Allow-Origin is explicitly set (never '*')
      callback(null, cleanOrigin);
    } else {
      const corsErr = new Error(`CORS Error: Origin '${origin}' is not permitted.`);
      corsErr.statusCode = 403;
      callback(corsErr);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204
};

// Mount CORS middleware for all incoming requests
app.use(cors(corsOptions));

// Explicitly handle and immediately respond 204 to all OPTIONS preflight requests
app.options('*', cors(corsOptions));

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);
// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/public', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/customer', customerDashboardRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/coupons', discountRoutes);


// Centralized 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
