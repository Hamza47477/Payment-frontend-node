# Payment Frontend Documentation

## Overview

The payment frontend is a Node.js Express-based payment collection system integrated with Stripe and the Taken Cafe backend. It provides a web interface for customers to complete orders with support for multiple payment methods: Card, Apple Pay, and Google Pay.

**Technology Stack:**
- Backend: Node.js Express server
- Frontend UI: HTML5 + Vanilla JavaScript
- Payment Provider: Stripe (PaymentIntent API)
- Payment Methods: Card, Apple Pay, Google Pay, Cash
- Currency: AED (United Arab Emirates Dirham)

---

## Architecture

### Directory Structure

```
payment-frontend-node/
├── server.js                 # Express server entry point
├── routes/
│   └── payment.js           # Payment API routes and Stripe integration
├── public/
│   ├── index.html           # Payment checkout UI
│   ├── css/
│   │   └── style.css        # Styling
│   └── js/
│       └── payment.js       # Frontend payment logic (optional separate file)
└── .env                      # Environment variables (Stripe API keys)
```

### Component Breakdown

1. **server.js** - Express server that serves static files and handles API routes
2. **routes/payment.js** - Backend payment processing logic
3. **public/index.html** - Customer-facing checkout UI with Stripe Payment Element
4. **Environment Configuration** - Stripe and backend API configuration

---

## Frontend Flow

### Page Load Sequence

```
1. Customer loads payment page (index.html?order_id=8)
   ↓
2. JavaScript initialization runs:
   - Fetch order details from backend
   - Fetch payment intent from backend
   - Initialize Stripe with payment intent
   - Display payment form
   ↓
3. Customer selects payment method (Card/Apple Pay/Google Pay)
   ↓
4. Customer completes payment
   ↓
5. Payment confirmation sent to backend
   ↓
6. Redirect to success/cancel page
```

### User Interactions

**Step 1: Order Data Retrieval**
```javascript
// Fetch order details
GET /api/orders/{order_id}
Response: {
  id: 8,
  total_amount: 150.50,
  currency: "AED",
  items: [...]
}
```

**Step 2: Payment Intent Creation**
```javascript
// Fetch or create payment intent
GET /api/payments/intents?order_id=8
Response: {
  payment_intent_id: "pi_xxx",
  client_secret: "pi_xxx_secret_xxx",
  amount: 15050,
  currency: "aed",
  status: "requires_payment_method",
  payment_method_types: ["card", "apple_pay", "google_pay"]
}
```

**Step 3: Stripe Initialization**
```javascript
// Initialize Stripe Payment Element
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
const elements = stripe.elements({
  clientSecret: clientSecret,
  appearance: { theme: 'stripe' }
});
const paymentElement = elements.create('payment');
paymentElement.mount('#payment-element');
```

**Step 4: Payment Submission**
```javascript
// User clicks "Pay" button
const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: `${window.location.origin}/success.html`
  }
});
```

**Step 5: Backend Payment Recording**
```javascript
// After payment confirmation, POST to backend
POST /api/payments
Body: {
  order_id: 8,
  payment_intent_id: "pi_xxx",
  payment_method: "card", // or "apple_pay", "google_pay"
  amount: 150.50,
  currency: "AED",
  customer_email: "customer@example.com"
}
Response: {
  id: 1,
  payment_id: "pay_xxx",
  status: "completed",
  payment_method: "card"
}
```

---

## API Endpoints

### Backend APIs Called by Frontend

#### 1. **Get Order Details**
```
GET /api/orders/{order_id}

Response (200 OK):
{
  "id": 8,
  "user_id": 1,
  "total_amount": 150.50,
  "currency": "AED",
  "status": "pending",
  "items": [
    {
      "id": 101,
      "name": "Espresso",
      "quantity": 2,
      "price": 35.00,
      "total": 70.00
    },
    {
      "id": 102,
      "name": "Cappuccino",
      "quantity": 1,
      "price": 40.00,
      "total": 40.00
    }
  ],
  "created_at": "2025-12-26T10:30:00Z",
  "updated_at": "2025-12-26T10:30:00Z"
}

Error (404 Not Found):
{
  "detail": "Order not found"
}
```

#### 2. **Create or Get Payment Intent**
```
GET /api/payments/intents?order_id=8

Response (200 OK):
{
  "id": 5,
  "payment_intent_id": "pi_1234567890abcdef",
  "order_id": 8,
  "amount": 150.50,
  "currency": "aed",
  "tip_amount": 0.0,
  "total_amount": 150.50,
  "status": "requires_payment_method",
  "payment_method": null,
  "allowed_payment_methods": "card,apple_pay,google_pay",
  "stripe_payment_intent_id": "pi_1234567890abcdef",
  "client_secret": "pi_1234567890abcdef_secret_xyz789",
  "customer_email": "customer@example.com",
  "created_at": "2025-12-26T10:30:00Z",
  "updated_at": "2025-12-26T10:30:00Z"
}

Error (400 Bad Request):
{
  "detail": "Order not found or invalid"
}
```

**Required Query Parameters:**
- `order_id` (integer): The order ID to create payment intent for

---

#### 3. **Record Payment (After Stripe Confirmation)**
```
POST /api/payments

Request Body:
{
  "order_id": 8,
  "payment_intent_id": "pi_1234567890abcdef",
  "payment_method": "card",
  "amount": 150.50,
  "currency": "AED",
  "tip_amount": 0.0,
  "customer_email": "customer@example.com",
  "customer_phone": "+971501234567",
  "metadata": {
    "payment_source": "web"
  }
}

Response (201 Created):
{
  "id": 1,
  "payment_id": "pay_20251226_001",
  "order_id": 8,
  "payment_method": "card",
  "status": "completed",
  "amount": 150.50,
  "currency": "AED",
  "tip_amount": 0.0,
  "total_amount": 150.50,
  "provider_transaction_id": "ch_1234567890abcdef",
  "customer_email": "customer@example.com",
  "customer_phone": "+971501234567",
  "created_at": "2025-12-26T10:35:00Z",
  "authorized_at": "2025-12-26T10:35:01Z",
  "completed_at": "2025-12-26T10:35:02Z"
}

Error (400 Bad Request):
{
  "detail": "Payment method is required"
}

Error (404 Not Found):
{
  "detail": "Order not found"
}
```

**Request Body Parameters:**
- `order_id` (required): Order ID
- `payment_intent_id` (required): Stripe payment intent ID
- `payment_method` (required): "card", "apple_pay", "google_pay", or "cash"
- `amount` (required): Payment amount
- `currency` (required): "AED"
- `tip_amount` (optional): Tip amount (default: 0)
- `customer_email` (optional): Customer email
- `customer_phone` (optional): Customer phone
- `metadata` (optional): Additional JSON metadata

---

#### 4. **Confirm Payment Intent (Stripe Backend)**
```
POST /api/payments/intents/confirm

Request Body:
{
  "payment_intent_id": "pi_1234567890abcdef",
  "payment_method_id": "pm_1234567890abcdef"
}

Response (200 OK):
{
  "client_secret": "pi_1234567890abcdef_secret_xyz789",
  "status": "succeeded",
  "payment_method": "card"
}

Error (400 Bad Request):
{
  "detail": "Invalid payment intent ID"
}
```

---

## Frontend Code Flow (`index.html`)

### 1. Page Initialization
```javascript
// Read order ID from URL query parameter or use default
const urlParams = new URLSearchParams(window.location.search);
const ORDER_ID = urlParams.get('order_id') || '8';

// Fetch order details
fetch(`/api/orders/${ORDER_ID}`)
  .then(res => res.json())
  .then(order => {
    // Display order summary
    displayOrderSummary(order);
    // Create payment intent
    return createPaymentIntent(order);
  })
  .then(paymentIntent => {
    // Initialize Stripe
    initializeStripe(paymentIntent);
  });
```

### 2. Payment Intent Creation
```javascript
async function createPaymentIntent(order) {
  const response = await fetch(
    `/api/payments/intents?order_id=${order.id}`
  );
  const paymentIntent = await response.json();
  return paymentIntent;
}
```

### 3. Stripe Initialization
```javascript
async function initializeStripe(paymentIntent) {
  const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  
  const elements = stripe.elements({
    clientSecret: paymentIntent.client_secret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#0066cc',
        colorText: '#333333'
      }
    }
  });
  
  // Create and mount payment element
  const paymentElement = elements.create('payment');
  paymentElement.mount('#payment-element');
  
  // Attach form submission handler
  document.getElementById('payment-form').addEventListener('submit', 
    (e) => handlePaymentSubmission(e, stripe, elements, paymentIntent)
  );
}
```

### 4. Payment Submission
```javascript
async function handlePaymentSubmission(
  event, 
  stripe, 
  elements, 
  paymentIntent
) {
  event.preventDefault();
  
  // Confirm payment with Stripe
  const { error, paymentIntentStatus } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: `${window.location.origin}/success.html`
    }
  });
  
  if (error) {
    // Display error message
    displayError(error.message);
  } else if (paymentIntentStatus === 'succeeded') {
    // Record payment in backend
    await recordPayment({
      order_id: ORDER_ID,
      payment_intent_id: paymentIntent.payment_intent_id,
      payment_method: getPaymentMethod(paymentIntentStatus),
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customer_email: document.getElementById('email').value
    });
    
    // Redirect to success
    window.location.href = '/success.html';
  }
}
```

### 5. Recording Payment
```javascript
async function recordPayment(paymentData) {
  const response = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData)
  });
  
  if (!response.ok) {
    throw new Error('Failed to record payment');
  }
  
  return response.json();
}
```

---

## Configuration

### Environment Variables (`.env`)

```bash
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Backend API Configuration
BACKEND_API_URL=http://localhost:8005
# Or for production:
# BACKEND_API_URL=https://api.takencafe.com

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Frontend Configuration (in `index.html`)

```javascript
// Stripe API Key (loaded from environment)
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_...';

// Order ID (from URL or default)
const ORDER_ID = new URLSearchParams(window.location.search).get('order_id') || '8';

// Currency
const CURRENCY = 'AED';
```

---

## Payment Methods Supported

### 1. **Card Payments**
- Visa
- Mastercard
- American Express
- Discover
- Diners Club
- JCB

**Flow:**
- Customer enters card details
- Stripe processes payment
- Backend records as `payment_method: "card"`

### 2. **Apple Pay**
- Requires HTTPS (or localhost for testing)
- Works on Safari browsers on iOS/macOS
- Wallet configured with card

**Flow:**
- Customer taps Apple Pay button
- Authenticates with biometric/passcode
- Stripe processes tokenized payment
- Backend records as `payment_method: "apple_pay"`

### 3. **Google Pay**
- Requires Android device
- Wallet configured with card or bank account

**Flow:**
- Customer taps Google Pay button
- Selects payment method from wallet
- Stripe processes tokenized payment
- Backend records as `payment_method: "google_pay"`

### 4. **Cash Payment** (Manual)
- Selected by customer
- Backend records as `payment_method: "cash"`
- No Stripe processing required

---

## Error Handling

### Frontend Errors

```javascript
// Stripe errors
{
  "type": "validation_error",
  "code": "incomplete_zip_code",
  "message": "ZIP code is required"
}

// Network errors
{
  "message": "Failed to load payment form: Backend Error"
}

// Order not found
{
  "detail": "Order not found"
}
```

### Common Error Scenarios

| Scenario | Error | Solution |
|----------|-------|----------|
| Invalid Order ID | "Order not found" | Verify order ID in URL |
| Network Timeout | "Failed to connect to backend" | Check backend server status |
| Invalid Card | "Your card has been declined" | Try different card or payment method |
| Expired Card | "Card has expired" | Use valid card |
| Insufficient Funds | "Insufficient funds on card" | Check account balance |

---

## Security Considerations

### Frontend Security
1. **HTTPS Required** - For production, HTTPS is mandatory for Stripe
2. **No Server-Side Card Data** - Cards are tokenized by Stripe, never stored
3. **Client-Side Validation** - Stripe.js handles all sensitive card validation
4. **CSP Headers** - Content Security Policy restricts script sources
5. **CORS** - Cross-Origin Resource Sharing configured for backend API

### Backend Security
1. **Stripe Secret Key** - Never exposed to frontend, used server-side only
2. **Token Validation** - All payment intents validated before processing
3. **Payment Method Storage** - Only storing method type, not sensitive data
4. **Rate Limiting** - API endpoints rate-limited to prevent abuse
5. **Authentication** - Backend APIs require valid session tokens

---

## Testing

### Local Testing

```bash
# 1. Start the payment server
npm install
npm start

# Server runs on http://localhost:3000

# 2. Test URLs
# Order 8
http://localhost:3000?order_id=8

# 3. Test Cards (Stripe Test Mode)
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)

# Visa Card
4242 4242 4242 4242

# Visa (debit)
4000 0566 5566 5556

# Mastercard
5555 5555 5555 4444

# American Express
3782 822463 10005

# Declined Card
4000 0000 0000 0002
```

### Test Payment Methods
- **Card**: Use test card numbers above
- **Apple Pay**: On Safari, test cards auto-added to wallet
- **Google Pay**: On Android, add test cards to Google Pay

---

## Deployment

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Environment Variables (Production)

```bash
# .env.production
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
BACKEND_API_URL=https://api.takencafe.com
PORT=3000
NODE_ENV=production
```

### Running with Docker Compose

```yaml
services:
  payment-frontend:
    build: ./payment-frontend-node
    ports:
      - "3000:3000"
    environment:
      STRIPE_PUBLISHABLE_KEY: ${STRIPE_PUBLISHABLE_KEY}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      BACKEND_API_URL: http://taken-backend:8005
    depends_on:
      - taken-backend
```

---

## Troubleshooting

### Issue: "Failed to load payment form"
**Solution:**
- Check browser console for errors
- Verify backend server is running
- Check CORS configuration
- Ensure order ID is valid

### Issue: "Card was declined"
**Solution:**
- Use valid test card number
- Check card expiry date
- Verify card CVV
- Check Stripe account is in test mode

### Issue: "Order not found"
**Solution:**
- Verify order exists in backend database
- Check order ID in URL query parameter
- Query backend API directly: `GET /api/orders/8`

### Issue: "Payment processing timeout"
**Solution:**
- Check network connection
- Verify backend is responding
- Check Stripe API status
- Review backend logs

---

## Integration Checklist

- [ ] Environment variables configured (`.env`)
- [ ] Stripe account created and API keys obtained
- [ ] Backend API running and accessible
- [ ] Database migrations applied
- [ ] Payment table created
- [ ] Test payment completed
- [ ] Error handling verified
- [ ] Success page configured
- [ ] HTTPS enabled (production)
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Monitoring setup

---

## Support & Resources

- **Stripe Documentation**: https://stripe.com/docs/payments/payment-element
- **Node.js Express**: https://expressjs.com/
- **Stripe.js**: https://stripe.com/docs/js
- **Payment Intent API**: https://stripe.com/docs/api/payment_intents
- **Test Cards**: https://stripe.com/docs/testing

---

**Last Updated:** December 26, 2025
**Version:** 1.0
**Status:** Clean Architecture - Single Payment Table
