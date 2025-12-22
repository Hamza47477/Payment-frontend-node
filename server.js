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

// 1. Serve static files from 'public' folder
// We add { dotfiles: 'allow' } to ensure Express doesn't auto-block the .well-known folder
app.use(express.static('public', { dotfiles: 'allow' }));

// 2. Explicitly serve the Apple Pay verification file
// (This acts as a backup to guarantee Apple can find it at the exact URL)
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '.well-known', 'apple-developer-merchantid-domain-association'));
});

// Import routes
const paymentRoutes = require('./routes/payment');

// Routes
app.use('/api/payment', paymentRoutes);

// Serve frontend (Single Page Application fallback)
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
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🔑 Stripe: ${process.env.STRIPE_PUBLISHABLE_KEY ? 'Configured' : 'Not configured'}`);
  // Note: I changed the log below slightly to avoid crashing if BACKEND_API_URL is missing
  console.log(`🔗 Backend: ${process.env.BACKEND_API_URL || 'Not set'}\n`);
});

module.exports = app;