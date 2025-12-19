const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Import routes
const paymentRoutes = require('./routes/payment');

// Routes
app.use('/api/payment', paymentRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Payment Frontend Server Running`);
  console.log(`📍 Local: http://livekit-mobile.linkedinwriter.io:${PORT}`);
  console.log(`🔑 Stripe: ${process.env.STRIPE_PUBLISHABLE_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`🔗 Backend: ${process.env.BACKEND_API_URL}\n`);
});

module.exports = app;
