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

// Basic HTTP security headers
app.use(helmet());

// Configurable CORS allowlist
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g., Postman, curl, server-to-server) with no origin
    if (!origin) return callback(null, true);
    
    const cleanOrigin = origin.replace(/\/+$/, '');
    const isVercelProjectOrigin = /^https:\/\/[a-z0-9-]*(shaan|shalimar)[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin);
    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
    if (config.allowedOrigins.indexOf(cleanOrigin) !== -1 || isVercelProjectOrigin || isLocalDevOrigin) {
      callback(null, true);
    } else {
      const corsErr = new Error(`CORS Error: Origin '${origin}' is not permitted.`);
      corsErr.statusCode = 403;
      callback(corsErr);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Request body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
