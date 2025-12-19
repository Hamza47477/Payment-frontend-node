const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const BACKEND_API = process.env.BACKEND_API_URL || 'https://livekit-mobile.linkedinwriter.io/api';

/**
 * Create Payment Intent via Backend API
 * This creates a payment intent using the backend API instead of Stripe directly
 * Recommended approach for new integrations
 */
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { orderId, currency = 'USD', tipAmount = 0, email } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: 'Missing required field: orderId'
      });
    }

    // Create Payment Intent via Backend API
    const backendResponse = await axios.post(`${BACKEND_API}/payments/intents`, {
      order_id: parseInt(orderId),
      currency: currency.toUpperCase(),
      tip_amount: tipAmount,
      receipt_email: email,
      customer_email: email,
      allowed_payment_methods: ['apple_pay', 'card', 'google_pay']
    });

    console.log('✅ Payment Intent created via backend:', backendResponse.data.payment_intent_id);

    res.json({
      clientSecret: backendResponse.data.client_secret,
      // Local ID for your DB lookups
      paymentIntentId: backendResponse.data.payment_intent_id,
      stripePaymentIntentId: backendResponse.data.stripe_payment_intent_id,
      amount: backendResponse.data.total_amount
    });
  } catch (error) {
    console.error('Error creating payment intent:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to create payment intent',
      message: error.response?.data?.detail || error.message
    });
  }
});

/**
 * Get Payment Intent Details
 */
router.get('/intent/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const response = await axios.get(`${BACKEND_API}/payments/intents/${paymentIntentId}`);

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching payment intent:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch payment intent',
      message: error.response?.data?.detail || error.message
    });
  }
});

/**
 * Confirm Payment Intent
 * Prepares the payment intent for capture
 */
router.post('/intent/:paymentIntentId/confirm', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const { paymentMethod, applePay, card } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({
        error: 'Missing payment method'
      });
    }

    const confirmData = {
      payment_intent_id: paymentIntentId,
      payment_method: paymentMethod
    };

    if (applePay) {
      confirmData.apple_pay_data = applePay;
    }
    if (card) {
      confirmData.card_data = card;
    }

    const response = await axios.post(
      `${BACKEND_API}/payments/intents/${paymentIntentId}/confirm`,
      confirmData
    );

    console.log('✅ Payment Intent confirmed');

    res.json(response.data);
  } catch (error) {
    console.error('Error confirming payment intent:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to confirm payment intent',
      message: error.response?.data?.detail || error.message
    });
  }
});

/**
 * Cancel Payment Intent
 */
router.post('/intent/:paymentIntentId/cancel', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const response = await axios.post(`${BACKEND_API}/payments/intents/${paymentIntentId}/cancel`);

    res.json(response.data);
  } catch (error) {
    console.error('Error canceling payment intent:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to cancel payment intent',
      message: error.response?.data?.detail || error.message
    });
  }
});

/**
 * Process Apple Pay Payment
 * Handles the complete flow: Stripe -> Backend API
 */
router.post('/process-apple-pay', async (req, res) => {
  try {
    const {
      paymentIntentId,
      orderId,
      paymentMethodId,
      amount,
      tipAmount = 0,
      method = 'apple_pay' // Default to apple_pay if not provided
    } = req.body;

    if (!paymentIntentId || !orderId || !paymentMethodId) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Resolve to Stripe PI id if caller provided a local (DB) id.
    let stripePaymentIntentId = paymentIntentId;
    if (typeof paymentIntentId === 'string' && paymentIntentId.startsWith('tpi_')) {
      const intentLookup = await axios.get(`${BACKEND_API}/payments/intents/${paymentIntentId}`);
      stripePaymentIntentId = intentLookup.data?.stripe_payment_intent_id;
    }

    if (!stripePaymentIntentId || !String(stripePaymentIntentId).startsWith('pi_')) {
      return res.status(400).json({
        error: 'Missing Stripe payment intent id for confirmation'
      });
    }

    // 1. Retrieve payment intent to check status
    let paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

    // Only confirm if not already succeeded
    if (paymentIntent.status !== 'succeeded') {
        paymentIntent = await stripe.paymentIntents.confirm(stripePaymentIntentId, {
            payment_method: paymentMethodId
        });
    }

    console.log('Stripe Payment Intent:', paymentIntent.status);

    if (paymentIntent.status === 'succeeded') {
      // 2. Record payment in backend
      try {
        const backendResponse = await axios.post(`${BACKEND_API}/payments`, {
          order_id: orderId,
          payment_method: method, // Use the method passed from frontend
          amount: amount,
          tip_amount: tipAmount,
          currency: 'USD',
          apple_pay_data: {
            payment_data: {
              data: 'encrypted_payment_data',
              signature: paymentIntent.id,
              version: 'v1',
              header: {
                transactionId: paymentIntent.id,
                ephemeralPublicKey: 'key',
                publicKeyHash: 'hash'
              }
            },
            transaction_identifier: paymentIntent.id,
            payment_method: {
              network: paymentIntent.payment_method_details?.card?.network || 'unknown',
              type: 'debit',
              displayName: `Card ending in ${paymentIntent.payment_method_details?.card?.last4 || '****'}`
            }
          },
          customer_email: req.body.email,
          metadata: {
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge
          }
        });

        // 3. Capture the payment in backend
        if (backendResponse.data && backendResponse.data.payment_id) {
          const captureResponse = await axios.post(
            `${BACKEND_API}/payments/${backendResponse.data.payment_id}/capture`
          );

          res.json({
            success: true,
            payment: captureResponse.data,
            stripePaymentIntent: paymentIntent.id,
            message: 'Payment successful'
          });
        } else {
          res.json({
            success: true,
            payment: backendResponse.data,
            stripePaymentIntent: paymentIntent.id,
            message: 'Payment recorded'
          });
        }
      } catch (backendError) {
        console.error('Backend API Error:', backendError.response?.data || backendError.message);
        
        // Payment succeeded in Stripe but failed to record in backend
        res.status(207).json({
          success: true,
          warning: 'Payment succeeded but failed to record in backend',
          stripePaymentIntent: paymentIntent.id,
          backendError: backendError.response?.data || backendError.message
        });
      }
    } else {
      res.status(400).json({
        error: 'Payment not successful',
        status: paymentIntent.status
      });
    }
  } catch (error) {
    console.error('Error processing Apple Pay:', error);
    res.status(500).json({
      error: 'Failed to process payment',
      message: error.message
    });
  }
});

/**
 * Get order details from backend
 */
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const response = await axios.get(`${BACKEND_API}/orders/${orderId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching order:', error);
    
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
 * Get payment status from backend
 */
router.get('/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const response = await axios.get(`${BACKEND_API}/payments/${paymentId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      error: 'Failed to fetch payment',
      message: error.message
    });
  }
});

/**
 * Get order payments from backend
 */
router.get('/order/:orderId/payments', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const response = await axios.get(`${BACKEND_API}/payments/order/${orderId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching order payments:', error);
    res.status(500).json({
      error: 'Failed to fetch order payments',
      message: error.message
    });
  }
});

/**
 * Create refund
 */
router.post('/refund', async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    
    const response = await axios.post(`${BACKEND_API}/payments/${paymentId}/refund`, {
      payment_id: parseInt(paymentId),
      amount: amount,
      reason: reason || 'Customer request',
      initiated_by: 'frontend'
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error creating refund:', error);
    res.status(500).json({
      error: 'Failed to create refund',
      message: error.message
    });
  }
});

module.exports = router;
