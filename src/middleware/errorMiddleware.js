const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404
    }
  });
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  
  // Safe logging in server console
  console.error(`[API Error] ${req.method} ${req.originalUrl} - Status: ${statusCode}`);
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(err.stack);
  }

  // Safe client response (never leak stack trace in production or sensitive database errors)
  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 && process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message || 'An unexpected error occurred',
      statusCode: statusCode
    }
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
