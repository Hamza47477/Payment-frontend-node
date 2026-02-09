const express = require('express');
const router = express.Router();
const axios = require('axios');

// Use live backend API
const BACKEND_API = process.env.BACKEND_API_URL || 'https://livekit-mobile.linkedinwriter.io/api';

/**
 * Get order details from backend
 */
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`Fetching order ${orderId} from ${BACKEND_API}`);

    // Direct call without auth header as requested by user ("remove authentication code")
    const response = await axios.get(`${BACKEND_API}/orders/${orderId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching order:', error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch order',
      message: error.message
    });
  }
});

/**
 * Create Q-Club Payment
 * Proxies the request to the backend
 */
router.post('/qclub/create-payment', async (req, res) => {
  try {
    const { order_id, amount, currency = 'IQD', tip_amount = 0 } = req.body;

    console.log(`Creating Q-Club payment for order ${order_id}`);

    const payload = {
      order_id: parseInt(order_id),
      amount: parseFloat(amount),
      currency: currency,
      tip_amount: parseFloat(tip_amount),
      metadata: {
        return_url: req.headers.referer || 'http://localhost:3000',
        webhook_url: `${BACKEND_API}/payments/qclub/webhook`
      }
    };

    const response = await axios.post(`${BACKEND_API}/payments/qclub/create-payment`, payload);

    res.json(response.data);
  } catch (error) {
    console.error('Error creating Q-Club payment:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create Q-Club payment',
      message: error.response?.data?.detail || error.message
    });
  }
});

module.exports = router;
