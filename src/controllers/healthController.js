const getHealth = (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'shaanwear-backend',
    version: '1.0.0'
  });
};

module.exports = {
  getHealth
};
