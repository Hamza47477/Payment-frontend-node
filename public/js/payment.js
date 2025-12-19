// Prefer same-origin API via the Node server.
// If API_BASE_URL is not defined by the page, default to the Node routes prefix.
const API_BASE_URL = typeof window.API_BASE_URL === 'string' ? window.API_BASE_URL : '/api/payment';

// Initialize Stripe
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
let elements;
let cardElement;
let paymentRequest; // Stripe Payment Request Object
let paymentIntentClientSecret;
let paymentIntentId;
let currentOrder = null;
let currentTipPercent = 15; // Default tip
let customTip = 0;

// DOM Elements
const orderDetailsDiv = document.getElementById('order-details');
const orderTotalSection = document.getElementById('order-total-section');
const tipSection = document.getElementById('tip-section');
const paymentSection = document.getElementById('payment-section');
const successSection = document.getElementById('success-section');
const errorSection = document.getElementById('error-section');
const paymentStatus = document.getElementById('payment-status');
const subtotalSpan = document.getElementById('subtotal');
const tipAmountSpan = document.getElementById('tip-amount');
const totalAmountSpan = document.getElementById('total-amount');
const customTipInput = document.getElementById('custom-tip-input');
const applePayButton = document.getElementById('apple-pay-button');
const cardPayButton = document.getElementById('card-pay-button');

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing payment page...');
    console.log('📦 Order ID:', ORDER_ID);
    
    try {
        await loadOrderDetails();
        setupTipButtons();
        await initializeStripeElements();
        setupPaymentRequestButton();
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize payment page: ' + error.message);
    }
});

/**
 * Load order details from backend
 */
async function loadOrderDetails() {
    try {
        const response = await fetch(`${API_BASE_URL}/order/${ORDER_ID}`);
        
        if (!response.ok) {
            throw new Error('Order not found');
        }
        
        currentOrder = await response.json();
        console.log('📋 Order loaded:', currentOrder);
        
        displayOrderDetails();
        updateTotals();
        
        // Show payment sections
        tipSection.style.display = 'block';
        paymentSection.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading order:', error);
        orderDetailsDiv.innerHTML = `
            <div class="error-message">
                ⚠️ Could not load order ${ORDER_ID}. Please check the order ID.
            </div>
        `;
        throw error;
    }
}

/**
 * Display order details in UI
 */
function displayOrderDetails() {
    if (!currentOrder || !currentOrder.items) {
        orderDetailsDiv.innerHTML = '<p>No items in order</p>';
        return;
    }
    
    let html = '<div class="order-items">';
    
    currentOrder.items.forEach(item => {
        html += `
            <div class="order-item">
                <div>
                    <span class="item-name">${item.product_id}</span>
                    <span class="item-quantity">x${item.quantity}</span>
                </div>
                <span class="item-price">$${item.price.toFixed(2)}</span>
            </div>
        `;
    });
    
    html += '</div>';
    
    orderDetailsDiv.innerHTML = html;
    orderTotalSection.style.display = 'block';
}

/**
 * Setup tip selection buttons
 */
function setupTipButtons() {
    const tipButtons = document.querySelectorAll('.tip-btn');
    
    tipButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            tipButtons.forEach(b => b.classList.remove('active'));
            
            // Add active class to clicked button
            btn.classList.add('active');
            
            // Update tip percentage
            currentTipPercent = parseInt(btn.dataset.percent);
            customTipInput.value = '';
            customTip = 0;
            
            updateTotals();
        });
    });
    
    // Custom tip input
    customTipInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value) || 0;
        customTip = value;
        
        // Deactivate percentage buttons
        tipButtons.forEach(b => b.classList.remove('active'));
        currentTipPercent = 0;
        
        updateTotals();
    });
}

/**
 * Calculate and update totals
 */
function updateTotals() {
    if (!currentOrder) return;
    
    const subtotal = currentOrder.total_price;
    let tip = customTip > 0 ? customTip : (subtotal * currentTipPercent / 100);
    const total = subtotal + tip;
    
    subtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
    tipAmountSpan.textContent = `$${tip.toFixed(2)}`;
    totalAmountSpan.textContent = `$${total.toFixed(2)}`;

    // Update Payment Request if it exists
    if (paymentRequest) {
        paymentRequest.update({
            total: {
                label: 'Taken Cafe Order',
                amount: Math.round(total * 100), // Amount in cents
            },
        });
    }
}

/**
 * Get current tip amount
 */
function getCurrentTip() {
    if (customTip > 0) {
        return customTip;
    }
    return currentOrder.total_price * currentTipPercent / 100;
}

/**
 * Get total amount (order + tip)
 */
function getTotalAmount() {
    return currentOrder.total_price + getCurrentTip();
}

/**
 * Initialize Stripe Elements for card payment
 */
async function initializeStripeElements() {
    try {
        // Create payment intent via Node -> Backend (backend computes amount server-side)
        const response = await fetch(`${API_BASE_URL}/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: ORDER_ID,
                currency: 'USD',
                tipAmount: getCurrentTip()
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create payment intent');
        }
        
        const data = await response.json();
        paymentIntentClientSecret = data.clientSecret;
        paymentIntentId = data.paymentIntentId;

        if (!paymentIntentClientSecret || !String(paymentIntentClientSecret).includes('_secret_')) {
            throw new Error('Invalid client secret returned from server');
        }
        
        console.log('✅ Payment Intent created:', paymentIntentId);
        
        // Create card element
        elements = stripe.elements();
        cardElement = elements.create('card', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#333',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    '::placeholder': {
                        color: '#aab7c4'
                    }
                }
            }
        });
        
        cardElement.mount('#card-element');
        
        // Setup card payment button
        cardPayButton.addEventListener('click', handleCardPayment);
        
    } catch (error) {
        console.error('Error initializing Stripe:', error);
        showError('Failed to initialize payment: ' + error.message);
    }
}

/**
 * Handle card payment
 */
async function handleCardPayment(e) {
    e.preventDefault();
    
    cardPayButton.disabled = true;
    cardPayButton.textContent = 'Processing...';
    showStatus('Processing payment...', 'processing');
    
    try {
        // Confirm card payment
        const { error, paymentIntent } = await stripe.confirmCardPayment(
            paymentIntentClientSecret,
            {
                payment_method: {
                    card: cardElement
                }
            }
        );
        
        if (error) {
            throw new Error(error.message);
        }
        
        if (paymentIntent.status === 'succeeded') {
            await recordPaymentInBackend(paymentIntent, 'card');
        } else {
            throw new Error('Payment was not successful');
        }
        
    } catch (error) {
        console.error('Card payment error:', error);
        showError(error.message);
        cardPayButton.disabled = false;
        cardPayButton.textContent = 'Pay with Card';
    }
}

/**
 * Setup Stripe Payment Request Button (Apple Pay / Google Pay)
 */
async function setupPaymentRequestButton() {
    // 1. Create Payment Request
    paymentRequest = stripe.paymentRequest({
        country: 'US',
        currency: 'usd',
        total: {
            label: 'Taken Cafe Order',
            amount: Math.round(getTotalAmount() * 100), // Amount in cents
        },
        requestPayerName: true,
        requestPayerEmail: true,
    });

    // 2. Check availability
    const result = await paymentRequest.canMakePayment();
    let walletType = 'card'; // Default fallback

    if (result) {
        console.log('✅ Payment Request Button available:', result);
        
        if (result.applePay) walletType = 'apple_pay';
        else if (result.googlePay) walletType = 'google_pay';
        
        // 3. Create and mount button
        const prButton = elements.create('paymentRequestButton', {
            paymentRequest: paymentRequest,
            style: {
                paymentRequestButton: {
                    theme: 'dark',
                    height: '48px',
                },
            },
        });

        prButton.mount('#payment-request-button');
        
        // Show separator
        document.getElementById('payment-separator').style.display = 'block';

        // 4. Handle Payment Method Event
        paymentRequest.on('paymentmethod', async (ev) => {
            try {
                console.log('💳 Payment Request method received:', ev.paymentMethod.id);
                
                // Confirm the PaymentIntent with the received payment method
                const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
                    paymentIntentClientSecret,
                    {
                        payment_method: ev.paymentMethod.id,
                    },
                    {
                        handleActions: false // We handle actions manually if needed
                    }
                );

                if (confirmError) {
                    // Report error to the browser payment interface
                    ev.complete('fail');
                    console.error('Confirm error:', confirmError);
                    showError(confirmError.message);
                } else {
                    // Report success to the browser payment interface
                    ev.complete('success');
                    
                    // Check if further action is needed (e.g. 3DS)
                    if (paymentIntent.status === 'requires_action') {
                        const { error: actionError } = await stripe.confirmCardPayment(paymentIntentClientSecret);
                        if (actionError) {
                            showError(actionError.message);
                            return;
                        }
                    }

                    // Record success in backend
                    await recordPaymentInBackend(paymentIntent, walletType);
                }
            } catch (err) {
                console.error('Payment Request error:', err);
                ev.complete('fail');
                showError(err.message);
            }
        });
    } else {
        console.log('❌ Payment Request Button not available (Apple Pay/Google Pay not supported on this device/browser)');
        document.getElementById('payment-request-button').style.display = 'none';
    }
}

/**
 * Record payment in backend after Stripe success
 */
async function recordPaymentInBackend(paymentIntent, method) {
    try {
        showStatus('Recording payment...', 'processing');
        
        const response = await fetch(`${API_BASE_URL}/process-apple-pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paymentIntentId: paymentIntent.id,
                orderId: ORDER_ID,
                paymentMethodId: paymentIntent.payment_method,
                amount: currentOrder.total_price,
                tipAmount: getCurrentTip(),
                method: method // 'card', 'apple_pay', 'google_pay'
            })
        });
        
        const result = await response.json();
        
        if (result.success || response.status === 207) {
            showSuccess(result.payment);
        } else {
            // Payment succeeded in Stripe but may have issues with backend
            showSuccess({
                payment_id: paymentIntent.id,
                status: 'completed',
                total_amount: getTotalAmount()
            }, result.warning);
        }
        
    } catch (error) {
        console.error('Error recording payment:', error);
        // Payment succeeded in Stripe, show success anyway
        showSuccess({
            payment_id: paymentIntent.id,
            status: 'completed',
            total_amount: getTotalAmount()
        }, 'Payment successful, but recording in system pending.');
    }
}

/**
 * Show payment status message
 */
function showStatus(message, type = 'processing') {
    paymentStatus.textContent = message;
    paymentStatus.className = `payment-status ${type}`;
    paymentStatus.style.display = 'block';
}

/**
 * Show success screen
 */
function showSuccess(payment, warning = null) {
    // Hide other sections
    tipSection.style.display = 'none';
    paymentSection.style.display = 'none';
    
    // Show success section
    successSection.style.display = 'block';
    
    const detailsDiv = document.getElementById('payment-details');
    detailsDiv.innerHTML = `
        ${warning ? `<p style="color: orange;">⚠️ ${warning}</p>` : ''}
        <p><strong>Payment ID:</strong> ${payment.payment_id || 'N/A'}</p>
        <p><strong>Order ID:</strong> ${ORDER_ID}</p>
        <p><strong>Amount:</strong> $${(payment.total_amount || getTotalAmount()).toFixed(2)}</p>
        <p><strong>Status:</strong> ${payment.status || 'Completed'}</p>
    `;
    
    console.log('✅ Payment successful:', payment);
}

/**
 * Show error screen
 */
function showError(message) {
    // Hide other sections
    tipSection.style.display = 'none';
    paymentSection.style.display = 'none';
    successSection.style.display = 'none';
    
    // Show error section
    errorSection.style.display = 'block';
    document.getElementById('error-message').textContent = message;
    
    console.error('❌ Payment error:', message);
}
